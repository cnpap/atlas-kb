<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('kb_sources') || ! Schema::hasColumn('kb_sources', 'title')) {
            return;
        }

        Schema::table('kb_sources', function (Blueprint $table): void {
            $table->dropColumn('title');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('kb_sources') || Schema::hasColumn('kb_sources', 'title')) {
            return;
        }

        Schema::table('kb_sources', function (Blueprint $table): void {
            $table->text('title')->nullable();
        });
    }
};
