<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\ShowKnowledgeTemplateExportTaskRequest;
use App\Models\KnowledgeTemplateExportTask;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class KnowledgeTemplateExportTaskDownloadController extends Controller
{
    public function __invoke(
        ShowKnowledgeTemplateExportTaskRequest $request,
        string $taskId,
    ): StreamedResponse {
        $task = KnowledgeTemplateExportTask::query()
            ->with('export')
            ->whereKey($taskId)
            ->where('owner_user_id', $request->userId())
            ->firstOrFail();

        abort_unless($task->export !== null, 404);

        return Storage::disk($task->export->output_disk)->download(
            $task->export->output_path,
            $task->export->output_filename,
            [
                'Content-Type' => $task->export->mime_type,
            ],
        );
    }
}
