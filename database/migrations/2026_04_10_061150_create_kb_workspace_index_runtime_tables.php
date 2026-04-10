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
        Schema::create('kb_workspace_index_checkpoints', function (Blueprint $table) {
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

        Schema::create('kb_embedding_rate_limit_states', function (Blueprint $table) {
            $table->text('user_key');
            $table->timestampTz('next_start_at');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('user_key', 'kb_embedding_rate_limit_states_pkey');
        });

        Schema::create('kb_embedding_rate_limit_leases', function (Blueprint $table) {
            $table->text('id');
            $table->text('user_key');
            $table->timestampTz('started_at');
            $table->timestampTz('expires_at');
            $table->timestampTz('created_at');

            $table->primary('id', 'kb_embedding_rate_limit_leases_pkey');
            $table->rawIndex('user_key, expires_at', 'idx_kb_embedding_rate_limit_leases_user');
            $table->rawIndex('expires_at', 'idx_kb_embedding_rate_limit_leases_expires');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_embedding_rate_limit_leases');
        Schema::dropIfExists('kb_embedding_rate_limit_states');
        Schema::dropIfExists('kb_workspace_index_checkpoints');
    }
};
