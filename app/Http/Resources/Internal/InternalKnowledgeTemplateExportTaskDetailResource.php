<?php

namespace App\Http\Resources\Internal;

use App\Models\KnowledgeTemplateExportTask;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InternalKnowledgeTemplateExportTaskDetailResource extends JsonResource
{
    /**
     * @mixin KnowledgeTemplateExportTask
     */
    public function toArray(Request $request): array
    {
        $template = $this->template;
        $fieldNames = $template?->fields->pluck('name')->all() ?? [];
        $storedParameters = is_array($this->parameters_json) ? $this->parameters_json : [];
        $parameters = collect($fieldNames)
            ->mapWithKeys(fn (string $name): array => [$name => (string) ($storedParameters[$name] ?? '')])
            ->all();

        return [
            ...InternalKnowledgeTemplateExportTaskResource::make($this->resource)->resolve($request),
            'template' => $template
                ? InternalKnowledgeTemplateDetailResource::make($template)->resolve($request)
                : null,
            'parameters' => $parameters,
            'canEdit' => $this->status === KnowledgeTemplateExportTask::STATUS_COMPLETED,
        ];
    }
}
