<?php

namespace App\Http\Resources\Internal;

use App\Models\KnowledgeTemplateExportTask;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InternalKnowledgeTemplateExportTaskResource extends JsonResource
{
    use FormatsAtlasKbTimestamp;

    /**
     * @mixin KnowledgeTemplateExportTask
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'ownerUserId' => (string) $this->owner_user_id,
            'sourceId' => $this->source_id,
            'sourceTitle' => $this->source_title,
            'taskType' => $this->task_type,
            'templateId' => $this->template_id,
            'templateName' => $this->template_name,
            'status' => $this->status,
            'failureMessage' => $this->failure_message,
            'createdAt' => $this->formatAtlasKbTimestamp($this->created_at),
            'updatedAt' => $this->formatAtlasKbTimestamp($this->updated_at),
            'startedAt' => $this->formatAtlasKbTimestamp($this->started_at),
            'completedAt' => $this->formatAtlasKbTimestamp($this->completed_at),
            'failedAt' => $this->formatAtlasKbTimestamp($this->failed_at),
            'exportFile' => $this->export
                ? [
                    'id' => $this->export->id,
                    'templateId' => $this->export->template_id,
                    'outputFilename' => $this->export->output_filename,
                    'mimeType' => $this->export->mime_type,
                    'byteSize' => $this->export->byte_size,
                    'downloadUrl' => $this->export->downloadUrl(),
                    'expiresAt' => $this->formatAtlasKbTimestamp($this->export->expires_at),
                    'createdAt' => $this->formatAtlasKbTimestamp($this->export->created_at),
                ]
                : null,
        ];
    }
}
