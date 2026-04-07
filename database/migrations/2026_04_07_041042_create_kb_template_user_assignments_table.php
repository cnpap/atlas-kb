<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('kb_template_user_assignments');
    }
};
