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
        Schema::create('kb_chat_feedback', function (Blueprint $table) {
            $table->text('id');
            $table->text('owner_user_id');
            $table->text('message_id');
            $table->text('rating');
            $table->text('note')->nullable();
            $table->timestampTz('created_at');

            $table->primary('id', 'kb_chat_feedback_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('kb_users')
                ->cascadeOnDelete();
            $table->foreign('message_id')
                ->references('id')
                ->on('kb_chat_messages')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, created_at DESC', 'idx_kb_chat_feedback_owner');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_chat_feedback');
    }
};
