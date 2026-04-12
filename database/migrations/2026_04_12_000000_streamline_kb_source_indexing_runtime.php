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
        if (! Schema::hasColumn('kb_sources', 'index_chunk_count')) {
            Schema::table('kb_sources', function (Blueprint $table): void {
                $table->integer('index_chunk_count')->default(0);
            });
        }

        Schema::dropIfExists('kb_import_jobs');
        Schema::dropIfExists('kb_workspace_index_checkpoints');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasTable('kb_workspace_index_checkpoints')) {
            Schema::create('kb_workspace_index_checkpoints', function (Blueprint $table): void {
                $table->text('scope_key');
                $table->text('path');
                $table->foreignId('owner_user_id');
                $table->text('collection_id');
                $table->text('status');
                $table->jsonb('checkpoint_json');
                $table->timestampTz('created_at');
                $table->timestampTz('updated_at');

                $table->primary(['scope_key', 'path'], 'kb_workspace_index_checkpoints_pkey');
                $table->foreign('owner_user_id')
                    ->references('id')
                    ->on('users')
                    ->cascadeOnDelete();
                $table->foreign('collection_id')
                    ->references('id')
                    ->on('kb_collections')
                    ->cascadeOnDelete();
                $table->rawIndex('owner_user_id, updated_at DESC', 'idx_kb_workspace_index_checkpoints_owner');
                $table->rawIndex('collection_id, updated_at DESC', 'idx_kb_workspace_index_checkpoints_collection');
                $table->rawIndex('status, updated_at DESC', 'idx_kb_workspace_index_checkpoints_status');
            });
        }

        if (! Schema::hasTable('kb_import_jobs')) {
            Schema::create('kb_import_jobs', function (Blueprint $table): void {
                $table->text('id');
                $table->foreignId('owner_user_id');
                $table->text('source_id');
                $table->text('collection_id');
                $table->text('source_type');
                $table->text('stage');
                $table->text('status');
                $table->integer('attempt');
                $table->text('error_message')->nullable();
                $table->timestampTz('started_at');
                $table->timestampTz('finished_at')->nullable();

                $table->primary('id', 'kb_import_jobs_pkey');
                $table->foreign('owner_user_id')
                    ->references('id')
                    ->on('users')
                    ->cascadeOnDelete();
                $table->foreign('source_id')
                    ->references('id')
                    ->on('kb_sources')
                    ->cascadeOnDelete();
                $table->foreign('collection_id')
                    ->references('id')
                    ->on('kb_collections')
                    ->cascadeOnDelete();
                $table->rawIndex('owner_user_id, started_at DESC', 'idx_kb_import_jobs_owner');
            });
        }

        if (Schema::hasColumn('kb_sources', 'index_chunk_count')) {
            Schema::table('kb_sources', function (Blueprint $table): void {
                $table->dropColumn('index_chunk_count');
            });
        }
    }
};
