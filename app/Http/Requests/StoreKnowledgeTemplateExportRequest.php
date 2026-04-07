<?php

namespace App\Http\Requests;

use App\Models\KnowledgeTemplate;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Collection;
use Illuminate\Validation\Validator;

class StoreKnowledgeTemplateExportRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
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

                $template = $this->route('assignedKnowledgeTemplate');

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
