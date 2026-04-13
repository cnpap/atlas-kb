<?php

namespace App\Http\Resources;

use App\Models\KnowledgeTemplateExportTask;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KnowledgeTemplateExportTaskResource extends JsonResource
{
    /**
     * @mixin KnowledgeTemplateExportTask
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'owner_user_id' => $this->owner_user_id,
            'source_id' => $this->source_id,
            'source_filename' => $this->source_filename,
            'task_type' => $this->task_type,
            'template_id' => $this->template_id,
            'template_name' => $this->template_name,
            'status' => $this->status,
            'failure_message' => $this->failure_message,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'started_at' => $this->started_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'failed_at' => $this->failed_at?->toIso8601String(),
            'export' => $this->export
                ? [
                    'id' => $this->export->id,
                    'template_id' => $this->export->template_id,
                    'output_filename' => $this->export->output_filename,
                    'mime_type' => $this->export->mime_type,
                    'byte_size' => $this->export->byte_size,
                    'download_url' => $this->export->downloadUrl(),
                    'expires_at' => $this->export->expires_at?->toIso8601String(),
                    'created_at' => $this->export->created_at?->toIso8601String(),
                ]
                : null,
        ];
    }
}
