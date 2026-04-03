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
            $table->text('owner_user_id');
            $table->text('title');
            $table->text('collection_id')->nullable();
            $table->text('preview');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->timestampTz('last_message_at');

            $table->primary('id', 'kb_chat_sessions_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('kb_users')
                ->cascadeOnDelete();
            $table->foreign('collection_id')
                ->references('id')
                ->on('kb_collections')
                ->nullOnDelete();
            $table->rawIndex('owner_user_id, last_message_at DESC', 'idx_kb_chat_sessions_owner');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_chat_sessions');
    }
};
