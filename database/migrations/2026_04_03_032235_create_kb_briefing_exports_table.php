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
        Schema::create('kb_briefing_exports', function (Blueprint $table) {
            $table->text('id');
            $table->foreignId('owner_user_id');
            $table->text('source_id');
            $table->text('document_id');
            $table->text('title');
            $table->text('summary');
            $table->jsonb('form_json');
            $table->jsonb('citations_json');
            $table->timestampTz('created_at');

            $table->primary('id', 'kb_briefing_exports_pkey');
            $table->foreign('owner_user_id')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();
            $table->foreign('source_id')
                ->references('id')
                ->on('kb_sources')
                ->cascadeOnDelete();
            $table->rawIndex('source_id, created_at DESC', 'idx_kb_briefing_exports_source');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_briefing_exports');
    }
};
