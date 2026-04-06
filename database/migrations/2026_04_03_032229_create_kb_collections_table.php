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
        Schema::create('kb_collections', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('name');
            $table->text('description');
            $table->text('color');
            $table->text('icon');
            $table->boolean('is_pinned')->default(false);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->timestampTz('last_activity_at');

            $table->primary('id', 'kb_collections_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, updated_at DESC', 'idx_kb_collections_owner');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_collections');
    }
};
