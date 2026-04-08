<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

function knowledgeTableColumns(string $table): array
{
    return collect(DB::select(
        <<<'SQL'
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?
            ORDER BY ordinal_position
        SQL,
        [$table],
    ))
        ->mapWithKeys(fn (object $column): array => [
            $column->column_name => [
                'data_type' => $column->data_type,
                'is_nullable' => $column->is_nullable,
                'column_default' => $column->column_default,
            ],
        ])
        ->all();
}

function knowledgeTableIndexes(string $table): array
{
    return collect(DB::select(
        <<<'SQL'
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = ?
            ORDER BY indexname
        SQL,
        [$table],
    ))
        ->mapWithKeys(fn (object $index): array => [$index->indexname => $index->indexdef])
        ->all();
}

function knowledgeTableForeignKeys(string $table): array
{
    return collect(DB::select(
        <<<'SQL'
            SELECT conname, pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            INNER JOIN pg_class t ON t.oid = c.conrelid
            INNER JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
              AND t.relname = ?
              AND c.contype = 'f'
            ORDER BY conname
        SQL,
        [$table],
    ))
        ->mapWithKeys(fn (object $constraint): array => [$constraint->conname => $constraint->definition])
        ->all();
}

test('development migrations are consolidated around feature boundaries', function () {
    $expectedMigrationFiles = [
        '2026_04_03_032229_create_kb_content_tables.php',
        '2026_04_03_032232_create_kb_conversation_tables.php',
        '2026_04_03_074812_create_kb_template_domain_tables.php',
    ];

    $obsoleteMigrationFiles = [
        '2025_08_14_170933_add_two_factor_columns_to_users_table.php',
        '2026_04_03_032230_create_kb_sources_table.php',
        '2026_04_03_032231_create_kb_import_jobs_table.php',
        '2026_04_03_032233_create_kb_chat_messages_table.php',
        '2026_04_03_032234_create_kb_chat_feedback_table.php',
        '2026_04_03_032235_create_kb_briefing_exports_table.php',
        '2026_04_03_074813_create_kb_template_fields_table.php',
        '2026_04_06_154057_create_knowledge_template_exports_table.php',
        '2026_04_07_020000_finalize_kb_chat_sessions_collection_contract.php',
        '2026_04_07_041040_create_knowledge_template_libraries_table.php',
        '2026_04_07_041041_create_knowledge_template_library_files_table.php',
        '2026_04_07_041042_create_kb_template_user_assignments_table.php',
        '2026_04_07_041043_create_kb_template_library_assignments_table.php',
    ];

    $actualMigrationFiles = collect(glob(database_path('migrations/*.php')))
        ->map(static fn (string $path): string => basename($path))
        ->values()
        ->all();

    expect($actualMigrationFiles)->toContain(...$expectedMigrationFiles)
        ->not->toContain(...$obsoleteMigrationFiles);
});

test('knowledge base tables are created with the expected contract', function () {
    $tables = [
        'kb_collections' => [
            'columns' => [
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'is_pinned' => ['data_type' => 'boolean', 'is_nullable' => 'NO', 'column_default' => 'false'],
                'last_activity_at' => ['data_type' => 'timestamp with time zone', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'idx_kb_collections_owner' => 'owner_user_id, updated_at DESC',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
            ],
        ],
        'kb_sources' => [
            'columns' => [
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'tags_json' => ['data_type' => 'jsonb', 'is_nullable' => 'NO'],
                'byte_size' => ['data_type' => 'bigint', 'is_nullable' => 'YES'],
                'source_filename' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'failure_message' => ['data_type' => 'text', 'is_nullable' => 'YES'],
            ],
            'indexes' => [
                'idx_kb_sources_collection' => 'collection_id, updated_at DESC',
                'idx_kb_sources_document' => 'owner_user_id, document_id',
                'idx_kb_sources_owner' => 'owner_user_id, updated_at DESC',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (collection_id) REFERENCES kb_collections(id) ON DELETE CASCADE',
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
            ],
        ],
        'kb_import_jobs' => [
            'columns' => [
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'attempt' => ['data_type' => 'integer', 'is_nullable' => 'NO'],
                'finished_at' => ['data_type' => 'timestamp with time zone', 'is_nullable' => 'YES'],
            ],
            'indexes' => [
                'idx_kb_import_jobs_owner' => 'owner_user_id, started_at DESC',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (collection_id) REFERENCES kb_collections(id) ON DELETE CASCADE',
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
                'FOREIGN KEY (source_id) REFERENCES kb_sources(id) ON DELETE CASCADE',
            ],
        ],
        'kb_chat_sessions' => [
            'columns' => [
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'collection_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'last_message_at' => ['data_type' => 'timestamp with time zone', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'idx_kb_chat_sessions_owner' => 'owner_user_id, last_message_at DESC',
                'idx_kb_chat_sessions_collection' => 'owner_user_id, collection_id, last_message_at DESC',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (collection_id) REFERENCES kb_collections(id) ON DELETE CASCADE',
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
            ],
        ],
        'kb_chat_messages' => [
            'columns' => [
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'citations_json' => ['data_type' => 'jsonb', 'is_nullable' => 'NO'],
                'retrieval_json' => ['data_type' => 'jsonb', 'is_nullable' => 'YES'],
                'trace_json' => ['data_type' => 'jsonb', 'is_nullable' => 'YES'],
            ],
            'indexes' => [
                'idx_kb_chat_messages_session' => 'session_id, created_at',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
                'FOREIGN KEY (session_id) REFERENCES kb_chat_sessions(id) ON DELETE CASCADE',
            ],
        ],
        'kb_chat_feedback' => [
            'columns' => [
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'note' => ['data_type' => 'text', 'is_nullable' => 'YES'],
            ],
            'indexes' => [
                'idx_kb_chat_feedback_owner' => 'owner_user_id, created_at DESC',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (message_id) REFERENCES kb_chat_messages(id) ON DELETE CASCADE',
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
            ],
        ],
        'kb_briefing_exports' => [
            'columns' => [
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'form_json' => ['data_type' => 'jsonb', 'is_nullable' => 'NO'],
                'citations_json' => ['data_type' => 'jsonb', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'idx_kb_briefing_exports_source' => 'source_id, created_at DESC',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
                'FOREIGN KEY (source_id) REFERENCES kb_sources(id) ON DELETE CASCADE',
            ],
        ],
        'kb_templates' => [
            'columns' => [
                'template_type' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'byte_size' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'parse_status' => ['data_type' => 'text', 'is_nullable' => 'NO', 'column_default' => 'pending'],
                'parse_error' => ['data_type' => 'text', 'is_nullable' => 'YES'],
                'is_active' => ['data_type' => 'boolean', 'is_nullable' => 'NO', 'column_default' => 'true'],
                'parsed_at' => ['data_type' => 'timestamp with time zone', 'is_nullable' => 'YES'],
            ],
            'indexes' => [
                'idx_kb_templates_status' => 'parse_status, updated_at DESC',
                'idx_kb_templates_active' => 'is_active, updated_at DESC',
            ],
            'foreign_keys' => [],
        ],
        'kb_template_fields' => [
            'columns' => [
                'template_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'description' => ['data_type' => 'text', 'is_nullable' => 'YES'],
                'meta_source' => ['data_type' => 'text', 'is_nullable' => 'NO', 'column_default' => 'default'],
                'sort_order' => ['data_type' => 'integer', 'is_nullable' => 'NO'],
                'locations_json' => ['data_type' => 'jsonb', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'kb_template_fields_template_id_name_unique' => 'UNIQUE',
                'idx_kb_template_fields_template' => 'template_id, sort_order, name',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (template_id) REFERENCES kb_templates(id) ON DELETE CASCADE',
            ],
        ],
        'kb_template_exports' => [
            'columns' => [
                'template_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'byte_size' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'expires_at' => ['data_type' => 'timestamp with time zone', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'idx_kb_template_exports_expires_at' => 'expires_at',
                'idx_kb_template_exports_owner' => 'owner_user_id, created_at DESC',
                'idx_kb_template_exports_template' => 'template_id, created_at DESC',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
                'FOREIGN KEY (template_id) REFERENCES kb_templates(id) ON DELETE CASCADE',
            ],
        ],
        'kb_template_export_tasks' => [
            'columns' => [
                'owner_user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'source_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'task_type' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'template_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'status' => ['data_type' => 'text', 'is_nullable' => 'NO', 'column_default' => 'pending'],
                'failure_message' => ['data_type' => 'text', 'is_nullable' => 'YES'],
            ],
            'indexes' => [
                'idx_kb_template_export_tasks_owner_source' => 'owner_user_id, source_id, created_at DESC',
                'idx_kb_template_export_tasks_owner_status' => 'owner_user_id, status, created_at DESC',
                'idx_kb_template_export_tasks_template' => 'template_id, created_at DESC',
                'kb_template_export_tasks_active_unique' => 'UNIQUE',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE',
                'FOREIGN KEY (source_id) REFERENCES kb_sources(id) ON DELETE CASCADE',
                'FOREIGN KEY (template_id) REFERENCES kb_templates(id) ON DELETE CASCADE',
                'FOREIGN KEY (export_id) REFERENCES kb_template_exports(id) ON DELETE SET NULL',
            ],
        ],
        'kb_template_libraries' => [
            'columns' => [
                'name' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'storage_prefix' => ['data_type' => 'text', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'idx_kb_template_libraries_updated_at' => 'updated_at DESC',
                'kb_template_libraries_storage_prefix_unique' => 'UNIQUE',
            ],
            'foreign_keys' => [],
        ],
        'kb_template_library_files' => [
            'columns' => [
                'library_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'byte_size' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'checksum_sha256' => ['data_type' => 'text', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'idx_kb_template_library_files_library' => 'library_id, created_at DESC',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (library_id) REFERENCES kb_template_libraries(id) ON DELETE CASCADE',
            ],
        ],
        'kb_template_user_assignments' => [
            'columns' => [
                'template_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'user_id' => ['data_type' => 'bigint', 'is_nullable' => 'NO'],
                'created_at' => ['data_type' => 'timestamp with time zone', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'idx_kb_template_user_assignments_user' => 'user_id, template_id',
                'kb_template_user_assignments_unique' => 'UNIQUE',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (template_id) REFERENCES kb_templates(id) ON DELETE CASCADE',
                'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
            ],
        ],
        'kb_template_library_assignments' => [
            'columns' => [
                'template_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'library_id' => ['data_type' => 'text', 'is_nullable' => 'NO'],
                'created_at' => ['data_type' => 'timestamp with time zone', 'is_nullable' => 'NO'],
            ],
            'indexes' => [
                'idx_kb_template_library_assignments_library' => 'library_id, template_id',
                'kb_template_library_assignments_unique' => 'UNIQUE',
            ],
            'foreign_keys' => [
                'FOREIGN KEY (library_id) REFERENCES kb_template_libraries(id) ON DELETE CASCADE',
                'FOREIGN KEY (template_id) REFERENCES kb_templates(id) ON DELETE CASCADE',
            ],
        ],
    ];

    if (DB::getDriverName() !== 'pgsql') {
        foreach ($tables as $table => $expectations) {
            expect(Schema::hasTable($table))->toBeTrue();
            expect(Schema::hasColumns($table, array_keys($expectations['columns'])))->toBeTrue();
        }

        return;
    }

    foreach ($tables as $table => $expectations) {
        expect(Schema::hasTable($table))->toBeTrue();

        $columns = knowledgeTableColumns($table);

        foreach ($expectations['columns'] as $column => $columnExpectations) {
            expect($columns)->toHaveKey($column);
            expect($columns[$column]['data_type'])->toBe($columnExpectations['data_type']);
            expect($columns[$column]['is_nullable'])->toBe($columnExpectations['is_nullable']);

            if (array_key_exists('column_default', $columnExpectations)) {
                expect((string) $columns[$column]['column_default'])->toContain($columnExpectations['column_default']);
            }
        }

        $indexes = knowledgeTableIndexes($table);

        foreach ($expectations['indexes'] as $indexName => $snippet) {
            expect($indexes)->toHaveKey($indexName);
            expect($indexes[$indexName])->toContain($snippet);
        }

        $foreignKeys = knowledgeTableForeignKeys($table);

        foreach ($expectations['foreign_keys'] as $definition) {
            expect(implode("\n", $foreignKeys))->toContain($definition);
        }
    }
});

test('knowledge base users are unified into the users table', function () {
    expect(Schema::hasTable('users'))->toBeTrue();
    expect(Schema::hasColumns('users', [
        'id',
        'name',
        'username',
        'email',
        'password',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'two_factor_confirmed_at',
    ]))->toBeTrue();
    expect(Schema::hasTable('kb_users'))->toBeFalse();

    if (DB::getDriverName() !== 'pgsql') {
        return;
    }

    $columns = knowledgeTableColumns('users');
    $indexes = knowledgeTableIndexes('users');

    expect($columns['username']['is_nullable'])->toBe('YES');
    expect($columns['email']['is_nullable'])->toBe('YES');
    expect($columns['two_factor_secret']['is_nullable'])->toBe('YES');
    expect($columns['two_factor_recovery_codes']['is_nullable'])->toBe('YES');
    expect($columns['two_factor_confirmed_at']['is_nullable'])->toBe('YES');
    expect(implode("\n", $indexes))->toContain('users_username_unique');
    expect(implode("\n", $indexes))->toContain('users_email_unique');
});

test('admin role and permission tables are created with the expected contract', function () {
    $tables = [
        'roles' => ['id', 'name', 'guard_name', 'created_at', 'updated_at'],
        'permissions' => ['id', 'name', 'guard_name', 'created_at', 'updated_at'],
        'model_has_roles' => ['role_id', 'model_type', 'model_id'],
        'model_has_permissions' => ['permission_id', 'model_type', 'model_id'],
        'role_has_permissions' => ['permission_id', 'role_id'],
    ];

    foreach ($tables as $table => $columns) {
        expect(Schema::hasTable($table))->toBeTrue();
        expect(Schema::hasColumns($table, $columns))->toBeTrue();
    }

    if (DB::getDriverName() !== 'pgsql') {
        return;
    }

    $roleIndexes = knowledgeTableIndexes('roles');
    $permissionIndexes = knowledgeTableIndexes('permissions');

    expect(implode("\n", $roleIndexes))->toContain('UNIQUE');
    expect(implode("\n", $permissionIndexes))->toContain('UNIQUE');
});
