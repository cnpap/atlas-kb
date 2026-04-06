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
        Schema::create('kb_templates', function (Blueprint $table) {
            $table->text('id');
            $table->text('name');
            $table->text('system_prompt')->default('');
            $table->text('template_type');
            $table->text('source_disk');
            $table->text('source_path');
            $table->text('source_filename');
            $table->text('mime_type');
            $table->bigInteger('byte_size');
            $table->text('checksum_sha256');
            $table->text('parse_status')->default('pending');
            $table->text('parse_error')->nullable();
            $table->text('parser_version')->default('ooxml-v1');
            $table->boolean('is_active')->default(true);
            $table->timestampTz('parsed_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_templates_pkey');
            $table->rawIndex('parse_status, updated_at DESC', 'idx_kb_templates_status');
            $table->rawIndex('is_active, updated_at DESC', 'idx_kb_templates_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_templates');
    }
};
