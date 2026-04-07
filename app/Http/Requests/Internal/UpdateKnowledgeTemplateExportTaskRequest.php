<?php

namespace App\Http\Requests\Internal;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateExportTask;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Collection;
use Illuminate\Validation\Validator;

class UpdateKnowledgeTemplateExportTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', 'min:1'],
            'parameters' => ['required', 'array'],
            'parameters.*' => [
                'nullable',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_array($value) || is_object($value)) {
                        $fail('模板参数只支持标量值。');
                    }
                },
            ],
        ];
    }

    /**
     * @return array<int, Closure(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $taskId = trim((string) $this->route('taskId', ''));

                if ($taskId === '') {
                    return;
                }

                $task = KnowledgeTemplateExportTask::query()
                    ->where('id', $taskId)
                    ->where('owner_user_id', $this->userId())
                    ->with('template.fields')
                    ->first();

                if (! $task instanceof KnowledgeTemplateExportTask) {
                    return;
                }

                $template = $task->template;

                if (! $template instanceof KnowledgeTemplate) {
                    return;
                }

                $fieldNames = $template->fields->pluck('name')->all();
                $providedKeys = array_keys($this->input('parameters', []));
                $missingKeys = array_values(array_diff($fieldNames, $providedKeys));
                $unexpectedKeys = array_values(array_diff($providedKeys, $fieldNames));

                if ($missingKeys !== []) {
                    $validator->errors()->add(
                        'parameters',
                        '缺少模板字段参数：'.implode('、', $missingKeys),
                    );
                }

                if ($unexpectedKeys !== []) {
                    $validator->errors()->add(
                        'parameters',
                        '存在未定义的模板字段参数：'.implode('、', $unexpectedKeys),
                    );
                }
            },
        ];
    }

    public function userId(): int
    {
        return $this->integer('user_id');
    }

    /**
     * @return array<string, string>
     */
    public function parameters(KnowledgeTemplate $template): array
    {
        $fieldNames = $template->fields->pluck('name')->all();

        return Collection::make($this->input('parameters', []))
            ->only($fieldNames)
            ->map(fn (mixed $value): string => $this->normalizeParameterValue($value))
            ->all();
    }

    protected function normalizeParameterValue(mixed $value): string
    {
        return match (true) {
            is_bool($value) => $value ? '1' : '0',
            $value === null => '',
            default => (string) $value,
        };
    }
}
