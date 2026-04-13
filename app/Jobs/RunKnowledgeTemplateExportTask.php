<?php

namespace App\Jobs;

use App\Models\KnowledgeTemplateExportTask;
use App\Support\AtlasKb\AtlasKbAgentClient;
use App\Support\KnowledgeTemplates\TemplateExportService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RunKnowledgeTemplateExportTask implements ShouldQueue
{
    use Queueable;

    public int $timeout = 900;

    public function __construct(
        public string $taskId,
    ) {}

    public function handle(
        AtlasKbAgentClient $agentClient,
        TemplateExportService $templateExportService,
    ): void {
        $task = KnowledgeTemplateExportTask::query()
            ->with([
                'ownerUser',
                'template.fields',
                'template.referenceLibraries.files',
            ])
            ->findOrFail($this->taskId);

        if ($task->status === KnowledgeTemplateExportTask::STATUS_COMPLETED) {
            return;
        }

        $task->forceFill([
            'status' => KnowledgeTemplateExportTask::STATUS_PROCESSING,
            'failure_message' => null,
            'started_at' => now(),
            'updated_at' => now(),
        ])->save();

        try {
            $payload = $agentClient->generateExportPayload(
                $task,
                $task->template,
                $task->ownerUser,
            );

            $export = $templateExportService->create(
                $task->template,
                $task->ownerUser,
                $payload['parameters'],
            );

            $task->forceFill([
                'parameters_json' => $payload['parameters'],
                'status' => KnowledgeTemplateExportTask::STATUS_COMPLETED,
                'export_id' => $export->id,
                'completed_at' => now(),
                'updated_at' => now(),
            ])->save();
        } catch (\Throwable $throwable) {
            $task->forceFill([
                'status' => KnowledgeTemplateExportTask::STATUS_FAILED,
                'failure_message' => $throwable->getMessage(),
                'failed_at' => now(),
                'updated_at' => now(),
            ])->save();

            throw $throwable;
        }
    }
}
