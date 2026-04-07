<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplateExport;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class TemplateExportPruner
{
    public function pruneExpired(): int
    {
        $deletedCount = 0;

        KnowledgeTemplateExport::query()
            ->where('expires_at', '<=', now())
            ->orderBy('expires_at')
            ->lazy()
            ->each(function (KnowledgeTemplateExport $export) use (&$deletedCount): void {
                DB::transaction(function () use ($export): void {
                    Storage::disk($export->output_disk)->delete($export->output_path);
                    $export->delete();
                });

                $deletedCount += 1;
            });

        return $deletedCount;
    }
}
