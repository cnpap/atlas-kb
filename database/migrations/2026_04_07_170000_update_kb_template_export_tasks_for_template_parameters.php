<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kb_template_export_tasks', function (Blueprint $table): void {
            $table->jsonb('parameters_json')->nullable()->after('template_name');
        });

        DB::statement('DROP INDEX IF EXISTS kb_template_export_tasks_active_unique');
        DB::statement(
            "CREATE UNIQUE INDEX kb_template_export_tasks_active_unique ON kb_template_export_tasks (owner_user_id, source_id, template_id) WHERE status IN ('pending', 'processing')"
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS kb_template_export_tasks_active_unique');
        DB::statement(
            "CREATE UNIQUE INDEX kb_template_export_tasks_active_unique ON kb_template_export_tasks (owner_user_id, source_id, task_type) WHERE status IN ('pending', 'processing')"
        );

        Schema::table('kb_template_export_tasks', function (Blueprint $table): void {
            $table->dropColumn('parameters_json');
        });
    }
};
