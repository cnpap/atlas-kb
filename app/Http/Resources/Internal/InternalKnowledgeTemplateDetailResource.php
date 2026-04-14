<?php

namespace App\Http\Resources\Internal;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateField;
use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeTemplateLibraryFile;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InternalKnowledgeTemplateDetailResource extends JsonResource
{
    /**
     * @mixin KnowledgeTemplate
     */
    public function toArray(Request $request): array
    {
        return [
            ...InternalKnowledgeTemplateSummaryResource::make($this->resource)->resolve($request),
            'systemPrompt' => (string) $this->system_prompt,
            'fields' => $this->fields
                ->map(function (KnowledgeTemplateField $field): array {
                    return [
                        'id' => $field->id,
                        'name' => $field->name,
                        'label' => $field->label,
                        'description' => $field->description ?? '',
                        'sortOrder' => $field->sort_order,
                    ];
                })
                ->all(),
            'referenceLibraries' => $this->referenceLibraries
                ->map(function (KnowledgeTemplateLibrary $library): array {
                    return [
                        'id' => $library->id,
                        'name' => $library->name,
                        'storagePrefix' => $library->storage_prefix,
                        'fileCount' => $library->files->count(),
                        'files' => $library->files
                            ->map(function (KnowledgeTemplateLibraryFile $file): array {
                                return [
                                    'sourcePath' => $file->source_path,
                                    'sourceFilename' => $file->source_filename,
                                    'mimeType' => $file->mime_type,
                                    'byteSize' => $file->byte_size,
                                ];
                            })
                            ->values()
                            ->all(),
                    ];
                })
                ->all(),
        ];
    }
}
