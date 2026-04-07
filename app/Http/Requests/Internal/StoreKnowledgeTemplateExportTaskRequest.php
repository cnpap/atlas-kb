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
            'task_type' => ['nullable', 'string'],
            'template_id' => ['nullable', 'string'],
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
        $value = trim((string) $this->input('task_type', 'briefing'));

        return $value !== '' ? $value : 'briefing';
    }

    public function templateId(): ?string
    {
        $value = trim((string) $this->input('template_id', ''));

        return $value !== '' ? $value : null;
    }
}
