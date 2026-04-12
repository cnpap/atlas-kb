<?php

use App\Support\KnowledgeTemplates\TemplateExportPruner;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('knowledge-templates:prune-exports', function (TemplateExportPruner $pruner) {
    $this->info(sprintf('已清理 %d 条过期模板导出记录。', $pruner->pruneExpired()));
})->purpose('Prune expired knowledge template exports');

Schedule::command('knowledge-templates:prune-exports')->daily();
