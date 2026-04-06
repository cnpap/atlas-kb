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
        Schema::create('kb_template_fields', function (Blueprint $table) {
            $table->text('id');
            $table->text('template_id');
            $table->text('name');
            $table->text('label');
            $table->text('description')->nullable();
            $table->text('meta_source')->default('default');
            $table->integer('sort_order');
            $table->jsonb('locations_json');
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->primary('id', 'kb_template_fields_pkey');
            $table->unique(['template_id', 'name'], 'kb_template_fields_template_id_name_unique');
            $table->foreign('template_id')
                ->references('id')
                ->on('kb_templates')
                ->cascadeOnDelete();
            $table->rawIndex('template_id, sort_order ASC, name ASC', 'idx_kb_template_fields_template');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('kb_template_fields');
    }
};
