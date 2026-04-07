<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kb_template_library_files', function (Blueprint $table) {
            $table->text('id');
            $table->text('library_id');
            $table->text('source_disk');
            $table->text('source_path');
            $table->text('source_filename');
            $table->text('mime_type');
            $table->bigInteger('byte_size');
            $table->text('checksum_sha256');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_template_library_files_pkey');
            $table->foreign('library_id')
                ->references('id')
                ->on('kb_template_libraries')
                ->cascadeOnDelete();
            $table->rawIndex('library_id, created_at DESC', 'idx_kb_template_library_files_library');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kb_template_library_files');
    }
};
