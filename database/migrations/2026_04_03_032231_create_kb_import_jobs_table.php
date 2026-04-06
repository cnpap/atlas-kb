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
    }
};
