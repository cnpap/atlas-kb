<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\ShowKnowledgeTemplateExportTaskRequest;
use App\Http\Resources\Internal\InternalKnowledgeTemplateExportTaskDetailResource;
use App\Models\KnowledgeTemplateExportTask;

class KnowledgeTemplateExportTaskShowController extends Controller
{
    public function __invoke(
        ShowKnowledgeTemplateExportTaskRequest $request,
        string $taskId,
    ): InternalKnowledgeTemplateExportTaskDetailResource {
        $task = KnowledgeTemplateExportTask::query()
            ->where('id', $taskId)
            ->where('owner_user_id', $request->userId())
            ->with([
                'export',
                'template.fields',
                'template.referenceLibraries.files',
            ])
            ->firstOrFail();

        return InternalKnowledgeTemplateExportTaskDetailResource::make($task);
    }
}
