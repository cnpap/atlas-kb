<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE kb_sources ALTER COLUMN summary DROP NOT NULL');
        DB::statement('ALTER TABLE kb_sources ALTER COLUMN content DROP NOT NULL');
    }

    public function down(): void
    {
        DB::statement("UPDATE kb_sources SET summary = '已回滚摘要占位' WHERE summary IS NULL");
        DB::statement("UPDATE kb_sources SET content = '已回滚正文占位' WHERE content IS NULL");
        DB::statement('ALTER TABLE kb_sources ALTER COLUMN summary SET NOT NULL');
        DB::statement('ALTER TABLE kb_sources ALTER COLUMN content SET NOT NULL');
    }
};
