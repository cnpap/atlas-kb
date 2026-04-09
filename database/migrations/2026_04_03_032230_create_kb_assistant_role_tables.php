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
        Schema::create('kb_assistant_roles', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id')->nullable();
            $table->text('name');
            $table->text('system_prompt')->default('');
            $table->text('style_prompt')->default('');
            $table->boolean('is_builtin')->default(false);
            $table->boolean('is_default')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->timestampTz('deleted_at')->nullable();

            $table->primary('id', 'kb_assistant_roles_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->rawIndex(
                'is_builtin, sort_order ASC, updated_at DESC',
                'idx_kb_assistant_roles_builtin',
            );
            $table->rawIndex(
                'owner_user_id, sort_order ASC, updated_at DESC',
                'idx_kb_assistant_roles_owner',
            );
        });

        Schema::create('kb_user_settings', function (Blueprint $table) {
            $table->foreignId('user_id');
            $table->text('active_assistant_role_id')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('user_id', 'kb_user_settings_pkey');
            $table->foreign('user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->foreign('active_assistant_role_id')
                ->references('id')
                ->on('kb_assistant_roles')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_user_settings');
        Schema::dropIfExists('kb_assistant_roles');
    }
};
