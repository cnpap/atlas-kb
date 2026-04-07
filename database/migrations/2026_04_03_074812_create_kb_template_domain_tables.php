<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('kb_templates', function (Blueprint $table) {
            $table->text('id');
            $table->text('name');
            $table->text('system_prompt')->default('');
            $table->text('template_type');
            $table->text('source_disk');
            $table->text('source_path');
            $table->text('source_filename');
            $table->text('mime_type');
            $table->bigInteger('byte_size');
            $table->text('checksum_sha256');
            $table->text('parse_status')->default('pending');
            $table->text('parse_error')->nullable();
            $table->text('parser_version')->default('ooxml-v1');
            $table->boolean('is_active')->default(true);
            $table->timestampTz('parsed_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_templates_pkey');
            $table->rawIndex('parse_status, updated_at DESC', 'idx_kb_templates_status');
            $table->rawIndex('is_active, updated_at DESC', 'idx_kb_templates_active');
        });

        Schema::create('kb_template_fields', function (Blueprint $table) {
            $table->text('id');
            $table->text('template_id');
            $table->text('name');
            $table->text('label');
            $table->text('description')->nullable();
            $table->text('meta_source')->default('default');
            $table->integer('sort_order');
            $table->jsonb('locations_json');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_template_fields_pkey');
            $table->unique(['template_id', 'name'], 'kb_template_fields_template_id_name_unique');
            $table->foreign('template_id')
                ->references('id')
                ->on('kb_templates')
                ->cascadeOnDelete();
            $table->rawIndex('template_id, sort_order ASC, name ASC', 'idx_kb_template_fields_template');
        });

        Schema::create('kb_template_exports', function (Blueprint $table) {
            $table->text('id');
            $table->text('template_id');
            $table->foreignId('owner_user_id');
            $table->text('output_disk');
            $table->text('output_path');
            $table->text('output_filename');
            $table->text('mime_type');
            $table->bigInteger('byte_size');
            $table->timestampTz('expires_at');
            $table->timestampTz('created_at');

            $table->primary('id', 'kb_template_exports_pkey');
            $table->foreign('template_id')
                ->references('id')
                ->on('kb_templates')
                ->cascadeOnDelete();
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, created_at DESC', 'idx_kb_template_exports_owner');
            $table->rawIndex('template_id, created_at DESC', 'idx_kb_template_exports_template');
            $table->rawIndex('expires_at', 'idx_kb_template_exports_expires_at');
        });

        Schema::create('kb_template_libraries', function (Blueprint $table) {
            $table->text('id');
            $table->text('name');
            $table->text('storage_prefix');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_template_libraries_pkey');
            $table->unique('storage_prefix', 'kb_template_libraries_storage_prefix_unique');
            $table->rawIndex('updated_at DESC', 'idx_kb_template_libraries_updated_at');
        });

        Schema::create('kb_template_library_files', function (Blueprint $table) {
            $table->text('id');
            $table->text('library_id');
            $table->text('source_disk');
            $table->text('source_path');
            $table->text('source_filename');
            $table->text('mime_type');
            $table->bigInteger('byte_size');
            $table->text('checksum_sha256');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_template_library_files_pkey');
            $table->foreign('library_id')
                ->references('id')
                ->on('kb_template_libraries')
                ->cascadeOnDelete();
            $table->rawIndex('library_id, created_at DESC', 'idx_kb_template_library_files_library');
        });

        Schema::create('kb_template_user_assignments', function (Blueprint $table) {
            $table->text('template_id');
            $table->foreignId('user_id');
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['template_id', 'user_id'], 'kb_template_user_assignments_unique');
            $table->foreign('template_id')
                ->references('id')
                ->on('kb_templates')
                ->cascadeOnDelete();
            $table->foreign('user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->rawIndex('user_id, template_id', 'idx_kb_template_user_assignments_user');
        });

        Schema::create('kb_template_library_assignments', function (Blueprint $table) {
            $table->text('template_id');
            $table->text('library_id');
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['template_id', 'library_id'], 'kb_template_library_assignments_unique');
            $table->foreign('template_id')
                ->references('id')
                ->on('kb_templates')
                ->cascadeOnDelete();
            $table->foreign('library_id')
                ->references('id')
                ->on('kb_template_libraries')
                ->cascadeOnDelete();
            $table->rawIndex('library_id, template_id', 'idx_kb_template_library_assignments_library');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_template_library_assignments');
        Schema::dropIfExists('kb_template_user_assignments');
        Schema::dropIfExists('kb_template_library_files');
        Schema::dropIfExists('kb_template_libraries');
        Schema::dropIfExists('kb_template_exports');
        Schema::dropIfExists('kb_template_fields');
        Schema::dropIfExists('kb_templates');
    }
};
