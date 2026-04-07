<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kb_template_export_tasks', function (Blueprint $table): void {
            $table->uuid('id');
            $table->unsignedBigInteger('owner_user_id');
            $table->text('source_id');
            $table->text('source_title');
            $table->text('task_type');
            $table->text('template_id');
            $table->text('template_name');
            $table->text('status')->default('pending');
            $table->text('failure_message')->nullable();
            $table->text('export_id')->nullable();
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->timestampTz('failed_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_template_export_tasks_pkey');
            $table->foreign('owner_user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('source_id')->references('id')->on('kb_sources')->cascadeOnDelete();
            $table->foreign('template_id')->references('id')->on('kb_templates')->cascadeOnDelete();
            $table->foreign('export_id')->references('id')->on('kb_template_exports')->nullOnDelete();
            $table->rawIndex('owner_user_id, source_id, created_at DESC', 'idx_kb_template_export_tasks_owner_source');
            $table->rawIndex('owner_user_id, status, created_at DESC', 'idx_kb_template_export_tasks_owner_status');
            $table->rawIndex('template_id, created_at DESC', 'idx_kb_template_export_tasks_template');
        });

        DB::statement(
            "CREATE UNIQUE INDEX kb_template_export_tasks_active_unique ON kb_template_export_tasks (owner_user_id, source_id, task_type) WHERE status IN ('pending', 'processing')"
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS kb_template_export_tasks_active_unique');
        Schema::dropIfExists('kb_template_export_tasks');
    }
};
