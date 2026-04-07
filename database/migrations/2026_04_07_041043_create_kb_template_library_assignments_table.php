<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kb_template_library_assignments', function (Blueprint $table) {
            $table->text('template_id');
            $table->text('library_id');
            $table->timestampTz('created_at')->useCurrent();

            $table->unique(['template_id', 'library_id'], 'kb_template_library_assignments_unique');
            $table->foreign('template_id')
                ->references('id')
                ->on('kb_templates')
                ->cascadeOnDelete();
            $table->foreign('library_id')
                ->references('id')
                ->on('kb_template_libraries')
                ->cascadeOnDelete();
            $table->rawIndex('library_id, template_id', 'idx_kb_template_library_assignments_library');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kb_template_library_assignments');
    }
};
