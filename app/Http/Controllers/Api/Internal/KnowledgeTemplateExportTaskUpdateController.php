<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\UpdateKnowledgeTemplateExportTaskRequest;
use App\Http\Resources\Internal\InternalKnowledgeTemplateExportTaskDetailResource;
use App\Models\KnowledgeTemplateExportTask;
use App\Support\KnowledgeTemplates\TemplateExportService;
use Illuminate\Http\JsonResponse;

class KnowledgeTemplateExportTaskUpdateController extends Controller
{
    public function __invoke(
        UpdateKnowledgeTemplateExportTaskRequest $request,
        TemplateExportService $templateExportService,
        string $taskId,
    ): JsonResponse {
        $task = KnowledgeTemplateExportTask::query()
            ->where('id', $taskId)
            ->where('owner_user_id', $request->userId())
            ->with([
                'ownerUser',
                'export',
                'template.fields',
                'template.referenceLibraries.files',
            ])
            ->firstOrFail();

        abort_if(
            $task->status !== KnowledgeTemplateExportTask::STATUS_COMPLETED,
            409,
            '当前任务尚未完成，暂时无法编辑。',
        );

        $parameters = $request->parameters($task->template);
        $export = $templateExportService->create(
            $task->template,
            $task->ownerUser,
            $parameters,
        );

        $task->forceFill([
            'parameters_json' => $parameters,
            'export_id' => $export->getKey(),
            'failure_message' => null,
            'updated_at' => now(),
        ])->save();

        $task->load([
            'export',
            'template.fields',
            'template.referenceLibraries.files',
        ]);

        return InternalKnowledgeTemplateExportTaskDetailResource::make($task)
            ->response()
            ->setStatusCode(200);
    }
}
