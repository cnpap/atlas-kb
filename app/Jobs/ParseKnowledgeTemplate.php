<?php

namespace App\Jobs;

use App\Models\KnowledgeTemplate;
use App\Support\KnowledgeTemplates\TemplateSyncService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ParseKnowledgeTemplate implements ShouldQueue
{
    use Queueable;

    public bool $deleteWhenMissingModels = true;

    public int $tries = 2;

    public int $timeout = 120;

    /**
     * Create a new job instance.
     */
    public function __construct(
        public string $templateId,
        public string $expectedChecksum,
    ) {}

    /**
     * Execute the job.
     */
    public function handle(TemplateSyncService $templateSyncService): void
    {
        $template = KnowledgeTemplate::query()
            ->with('fields')
            ->find($this->templateId);

        if (! $template instanceof KnowledgeTemplate) {
            return;
        }

        $templateSyncService->parseAndSync($template, $this->expectedChecksum);
    }
}
