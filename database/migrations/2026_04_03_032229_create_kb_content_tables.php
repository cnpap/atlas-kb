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
        Schema::create('kb_collections', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('name');
            $table->text('description');
            $table->text('color');
            $table->text('icon');
            $table->boolean('is_pinned')->default(false);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
            $table->timestampTz('last_activity_at');

            $table->primary('id', 'kb_collections_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, updated_at DESC', 'idx_kb_collections_owner');
        });

        Schema::create('kb_sources', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('collection_id');
            $table->text('document_id');
            $table->text('title');
            $table->text('content');
            $table->text('source_type');
            $table->text('status');
            $table->text('source_filename');
            $table->text('mime_type')->nullable();
            $table->bigInteger('byte_size')->nullable();
            $table->text('failure_message')->nullable();
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

        Schema::create('kb_import_jobs', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('source_id');
            $table->text('collection_id');
            $table->text('source_type');
            $table->text('stage');
            $table->text('status');
            $table->integer('attempt');
            $table->text('error_message')->nullable();
            $table->timestampTz('started_at');
            $table->timestampTz('finished_at')->nullable();

            $table->primary('id', 'kb_import_jobs_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->foreign('source_id')
                ->references('id')
                ->on('kb_sources')
                ->cascadeOnDelete();
            $table->foreign('collection_id')
                ->references('id')
                ->on('kb_collections')
                ->cascadeOnDelete();
            $table->rawIndex('owner_user_id, started_at DESC', 'idx_kb_import_jobs_owner');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_import_jobs');
        Schema::dropIfExists('kb_sources');
        Schema::dropIfExists('kb_collections');
    }
};
