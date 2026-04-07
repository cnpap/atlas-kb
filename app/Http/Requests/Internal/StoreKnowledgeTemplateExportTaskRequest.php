<?php

namespace App\Http\Requests\Internal;

use Illuminate\Foundation\Http\FormRequest;

class StoreKnowledgeTemplateExportTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', 'min:1'],
            'source_id' => ['required', 'string'],
            'template_id' => ['required', 'string'],
        ];
    }

    public function userId(): int
    {
        return $this->integer('user_id');
    }

    public function sourceId(): string
    {
        return trim((string) $this->input('source_id'));
    }

    public function taskType(): string
    {
        return 'template';
    }

    public function templateId(): string
    {
        return trim((string) $this->input('template_id'));
    }
}
