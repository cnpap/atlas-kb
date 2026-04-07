<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kb_template_libraries', function (Blueprint $table) {
            $table->text('id');
            $table->text('name');
            $table->text('storage_prefix');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_template_libraries_pkey');
            $table->unique('storage_prefix', 'kb_template_libraries_storage_prefix_unique');
            $table->rawIndex('updated_at DESC', 'idx_kb_template_libraries_updated_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kb_template_libraries');
    }
};
