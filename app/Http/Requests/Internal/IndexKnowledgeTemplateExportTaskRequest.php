<?php

namespace App\Http\Requests\Internal;

use Illuminate\Foundation\Http\FormRequest;

class IndexKnowledgeTemplateExportTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', 'min:1'],
            'source_id' => ['nullable', 'string'],
            'task_ids' => ['nullable', 'string'],
        ];
    }

    public function userId(): int
    {
        return $this->integer('user_id');
    }

    public function sourceId(): ?string
    {
        $value = trim((string) $this->input('source_id', ''));

        return $value !== '' ? $value : null;
    }

    /**
     * @return array<int, string>
     */
    public function taskIds(): array
    {
        $value = trim((string) $this->input('task_ids', ''));

        if ($value === '') {
            return [];
        }

        return collect(explode(',', $value))
            ->map(fn (string $id): string => trim($id))
            ->filter()
            ->values()
            ->all();
    }
}
