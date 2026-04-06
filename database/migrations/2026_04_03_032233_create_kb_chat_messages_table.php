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
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_chat_messages');
    }
};
