<?php

namespace App\Http\Resources;

use App\Models\KnowledgeTemplateExport;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KnowledgeTemplateExportResource extends JsonResource
{
    /**
     * @mixin KnowledgeTemplateExport
     */

    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'template_id' => $this->template_id,
            'template' => KnowledgeTemplateSummaryResource::make($this->template)->resolve($request),
            'owner_user' => [
                'id' => $this->ownerUser->id,
                'name' => $this->ownerUser->name,
                'username' => $this->ownerUser->username,
            ],
            'output_filename' => $this->output_filename,
            'mime_type' => $this->mime_type,
            'byte_size' => $this->byte_size,
            'download_url' => $this->downloadUrl(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
