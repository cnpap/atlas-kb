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
        Schema::create('kb_chat_sessions', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('title');
            $table->text('collection_id');
            $table->text('preview');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->timestampTz('last_message_at');

            $table->primary('id', 'kb_chat_sessions_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->foreign('collection_id')
                ->references('id')
                ->on('kb_collections')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, last_message_at DESC', 'idx_kb_chat_sessions_owner');
            $table->rawIndex('owner_user_id, collection_id, last_message_at DESC', 'idx_kb_chat_sessions_collection');
        });

        Schema::create('kb_chat_messages', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('session_id');
            $table->text('role');
            $table->text('content');
            $table->jsonb('citations_json');
            $table->jsonb('retrieval_json')->nullable();
            $table->jsonb('trace_json')->nullable();
            $table->timestampTz('created_at');

            $table->primary('id', 'kb_chat_messages_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->foreign('session_id')
                ->references('id')
                ->on('kb_chat_sessions')
                ->cascadeOnDelete();
            $table->rawIndex('session_id, created_at ASC', 'idx_kb_chat_messages_session');
        });

        Schema::create('kb_chat_feedback', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('message_id');
            $table->text('rating');
            $table->text('note')->nullable();
            $table->timestampTz('created_at');

            $table->primary('id', 'kb_chat_feedback_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->foreign('message_id')
                ->references('id')
                ->on('kb_chat_messages')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, created_at DESC', 'idx_kb_chat_feedback_owner');
        });

        Schema::create('kb_briefing_exports', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('source_id');
            $table->text('document_id');
            $table->text('title');
            $table->text('summary');
            $table->jsonb('form_json');
            $table->jsonb('citations_json');
            $table->timestampTz('created_at');

            $table->primary('id', 'kb_briefing_exports_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->foreign('source_id')
                ->references('id')
                ->on('kb_sources')
                ->cascadeOnDelete();
            $table->rawIndex('source_id, created_at DESC', 'idx_kb_briefing_exports_source');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_briefing_exports');
        Schema::dropIfExists('kb_chat_feedback');
        Schema::dropIfExists('kb_chat_messages');
        Schema::dropIfExists('kb_chat_sessions');
    }
};
