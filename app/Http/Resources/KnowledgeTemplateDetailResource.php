<?php

namespace App\Http\Resources;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateField;
use App\Models\KnowledgeTemplateLibrary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class KnowledgeTemplateDetailResource extends JsonResource
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
            ...KnowledgeTemplateSummaryResource::make($this->resource)->resolve($request),
            'system_prompt' => (string) $this->system_prompt,
            'fields' => $this->fields
                ->map(function (KnowledgeTemplateField $field): array {
                    return [
                        'id' => $field->id,
                        'name' => $field->name,
                        'label' => $field->label,
                        'description' => $field->description,
                        'sort_order' => $field->sort_order,
                    ];
                })
                ->all(),
            'reference_libraries' => $this->referenceLibraries
                ->map(function (KnowledgeTemplateLibrary $library): array {
                    return [
                        'id' => $library->id,
                        'name' => $library->name,
                        'storage_prefix' => $library->storage_prefix,
                        'file_count' => $library->files->count(),
                    ];
                })
                ->all(),
        ];
    }
}
