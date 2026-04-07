<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\IndexKnowledgeTemplateExportTaskRequest;
use App\Http\Resources\Internal\InternalKnowledgeTemplateExportTaskResource;
use App\Models\KnowledgeTemplateExportTask;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class KnowledgeTemplateExportTaskIndexController extends Controller
{
    public function __invoke(IndexKnowledgeTemplateExportTaskRequest $request): AnonymousResourceCollection
    {
        $query = KnowledgeTemplateExportTask::query()
            ->where('owner_user_id', $request->userId())
            ->with('export')
            ->orderByDesc('created_at');

        if ($request->sourceId()) {
            $query->where('source_id', $request->sourceId());
        }

        if ($request->taskIds() !== []) {
            $query->whereIn('id', $request->taskIds());
        }

        return InternalKnowledgeTemplateExportTaskResource::collection($query->get());
    }
}
