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
        Schema::create('kb_sources', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('collection_id');
            $table->text('document_id');
            $table->text('title');
            $table->text('summary');
            $table->text('excerpt');
            $table->text('content_preview');
            $table->text('content');
            $table->jsonb('tags_json');
            $table->text('source_type');
            $table->text('status');
            $table->text('source_filename')->nullable();
            $table->text('source_url')->nullable();
            $table->text('mime_type')->nullable();
            $table->bigInteger('byte_size')->nullable();
            $table->integer('latest_version')->default(1);
            $table->timestampTz('ready_at')->nullable();
            $table->timestampTz('last_processed_at')->nullable();
            $table->timestampTz('snapshot_updated_at')->nullable();
            $table->text('failure_message')->nullable();
            $table->text('original_path')->nullable();
            $table->text('index_path');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_sources_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->foreign('collection_id')
                ->references('id')
                ->on('kb_collections')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, updated_at DESC', 'idx_kb_sources_owner');
            $table->rawIndex('collection_id, updated_at DESC', 'idx_kb_sources_collection');
            $table->rawIndex('owner_user_id, document_id', 'idx_kb_sources_document');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_sources');
    }
};
