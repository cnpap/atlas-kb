<?php

namespace App\Http\Resources;

use App\Models\KnowledgeTemplate;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KnowledgeTemplateSummaryResource extends JsonResource
{
    /**
     * @mixin KnowledgeTemplate
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
            'name' => $this->name,
            'template_type' => $this->template_type,
            'source_filename' => $this->source_filename,
            'field_count' => (int) $this->fields_count,
            'reference_library_count' => (int) ($this->reference_libraries_count ?? 0),
            'parsed_at' => $this->parsed_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
