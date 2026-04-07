<?php

namespace App\Http\Resources\Internal;

use App\Models\KnowledgeTemplate;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InternalKnowledgeTemplateSummaryResource extends JsonResource
{
    use FormatsAtlasKbTimestamp;

    /**
     * @mixin KnowledgeTemplate
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'templateType' => $this->template_type,
            'sourceFilename' => $this->source_filename,
            'fieldCount' => (int) $this->fields_count,
            'referenceLibraryCount' => (int) ($this->reference_libraries_count ?? 0),
            'parsedAt' => $this->formatAtlasKbTimestamp($this->parsed_at),
            'updatedAt' => $this->formatAtlasKbTimestamp($this->updated_at),
        ];
    }
}
