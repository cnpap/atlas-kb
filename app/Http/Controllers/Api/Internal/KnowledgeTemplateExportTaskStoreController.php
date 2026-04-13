<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\StoreKnowledgeTemplateExportTaskRequest;
use App\Http\Resources\Internal\InternalKnowledgeTemplateExportTaskResource;
use App\Jobs\RunKnowledgeTemplateExportTask;
use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateExportTask;
use App\Models\KnowledgeUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class KnowledgeTemplateExportTaskStoreController extends Controller
{
    public function __invoke(StoreKnowledgeTemplateExportTaskRequest $request): JsonResponse
    {
        $user = KnowledgeUser::query()->findOrFail($request->userId());

        $source = DB::table('kb_sources')
            ->select(['id', 'source_filename'])
            ->where('id', $request->sourceId())
            ->where('owner_user_id', $user->getKey())
            ->first();

        abort_unless($source !== null, 404, 'Source not found.');

        $template = $this->resolveTemplate($user, $request->templateId());

        $existingTask = KnowledgeTemplateExportTask::query()
            ->with('export')
            ->where('owner_user_id', $user->getKey())
            ->where('source_id', $request->sourceId())
            ->where('template_id', $template->getKey())
            ->whereIn('status', [
                KnowledgeTemplateExportTask::STATUS_PENDING,
                KnowledgeTemplateExportTask::STATUS_PROCESSING,
            ])
            ->latest('created_at')
            ->first();

        if ($existingTask) {
            return InternalKnowledgeTemplateExportTaskResource::make($existingTask)
                ->response()
                ->setStatusCode(200);
        }

        $task = KnowledgeTemplateExportTask::query()->create([
            'owner_user_id' => $user->getKey(),
            'source_id' => $request->sourceId(),
            'source_filename' => (string) $source->source_filename,
            'task_type' => 'template',
            'template_id' => $template->getKey(),
            'template_name' => $template->name,
            'status' => KnowledgeTemplateExportTask::STATUS_PENDING,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        RunKnowledgeTemplateExportTask::dispatch($task->getKey())->afterCommit();

        return InternalKnowledgeTemplateExportTaskResource::make($task)
            ->response()
            ->setStatusCode(201);
    }

    protected function resolveTemplate(
        KnowledgeUser $user,
        string $templateId,
    ): KnowledgeTemplate {
        return $user->assignedKnowledgeTemplates()
            ->available()
            ->with(['fields', 'referenceLibraries.files'])
            ->where('kb_templates.id', $templateId)
            ->firstOrFail();
    }
}
