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
        Schema::create('kb_template_exports', function (Blueprint $table) {
            $table->text('id');
            $table->text('template_id');
            $table->foreignId('owner_user_id');
            $table->text('output_disk');
            $table->text('output_path');
            $table->text('output_filename');
            $table->text('mime_type');
            $table->bigInteger('byte_size');
            $table->timestampTz('expires_at');
            $table->timestampTz('created_at');

            $table->primary('id', 'kb_template_exports_pkey');
            $table->foreign('template_id')
                ->references('id')
                ->on('kb_templates')
                ->cascadeOnDelete();
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, created_at DESC', 'idx_kb_template_exports_owner');
            $table->rawIndex('template_id, created_at DESC', 'idx_kb_template_exports_template');
            $table->rawIndex('expires_at', 'idx_kb_template_exports_expires_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_template_exports');
    }
};
