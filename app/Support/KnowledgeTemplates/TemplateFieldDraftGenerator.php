<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateField;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class TemplateFieldDraftGenerator
{
    /**
     * @param  Collection<int, KnowledgeTemplateField>  $fields
     * @return array<string, array{label: string, description: ?string, meta_source: string}>
     */
    public function generate(KnowledgeTemplate $template, Collection $fields): array
    {
        $defaults = $fields
            ->mapWithKeys(fn (KnowledgeTemplateField $field): array => [
                $field->name => [
                    'label' => (string) $field->placeholder_name,
                    'description' => null,
                    'meta_source' => KnowledgeTemplateField::META_SOURCE_DEFAULT,
                ],
            ])
            ->all();

        if ($fields->isEmpty() || ! (bool) config('knowledge-templates.ai.enabled', true)) {
            return $defaults;
        }

        $clientConfig = $this->resolveClientConfig();

        if ($clientConfig === null) {
            return $defaults;
        }

        try {
            $response = Http::timeout($clientConfig['timeout'])
                ->acceptJson()
                ->asJson()
                ->withToken($clientConfig['api_key'])
                ->post(rtrim($clientConfig['base_url'], '/').'/chat/completions', [
                    'model' => $clientConfig['model'],
                    'temperature' => 0.2,
                    'messages' => [
                        [
                            'role' => 'system',
                            'content' => '你是模板字段元信息生成助手。请基于模板名称、系统提示词和字段上下文，为每个字段生成简洁中文 label 与 description。必须只输出 JSON，格式为 {"fields":[{"name":"字段名","label":"中文标签","description":"中文描述"}]}。',
                        ],
                        [
                            'role' => 'user',
                            'content' => json_encode([
                                'template' => [
                                    'name' => $template->name,
                                    'type' => $template->template_type,
                                    'system_prompt' => $template->system_prompt,
                                ],
                                'fields' => $fields->map(fn (KnowledgeTemplateField $field): array => [
                                    'name' => $field->name,
                                    'placeholder_name' => $field->placeholder_name,
                                    'label' => $field->label,
                                ])->values()->all(),
                            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        ],
                    ],
                ])
                ->throw()
                ->json();

            $content = $this->normalizeContent(data_get($response, 'choices.0.message.content'));

            if ($content === '') {
                throw new RuntimeException('AI 返回内容为空。');
            }

            $decoded = json_decode($this->extractJsonObject($content), true, 512, JSON_THROW_ON_ERROR);
            $drafts = $defaults;

            foreach (($decoded['fields'] ?? []) as $fieldDraft) {
                $name = is_array($fieldDraft) ? ($fieldDraft['name'] ?? null) : null;
                $label = is_array($fieldDraft) ? ($fieldDraft['label'] ?? null) : null;
                $description = is_array($fieldDraft) ? ($fieldDraft['description'] ?? null) : null;

                if (! is_string($name) || ! array_key_exists($name, $drafts) || ! is_string($label) || trim($label) === '') {
                    continue;
                }

                $drafts[$name] = [
                    'label' => trim($label),
                    'description' => is_string($description) && trim($description) !== '' ? trim($description) : null,
                    'meta_source' => KnowledgeTemplateField::META_SOURCE_AI,
                ];
            }

            return $drafts;
        } catch (Throwable $throwable) {
            report($throwable);

            return $defaults;
        }
    }

    /**
     * @return array{base_url: string, api_key: string, model: string, timeout: int}|null
     */
    protected function resolveClientConfig(): ?array
    {
        $configured = [
            'base_url' => config('knowledge-templates.ai.base_url'),
            'api_key' => config('knowledge-templates.ai.api_key'),
            'model' => config('knowledge-templates.ai.model'),
            'timeout' => (int) config('knowledge-templates.ai.timeout', 60),
        ];

        if ($configured['base_url'] && $configured['api_key'] && $configured['model']) {
            return $configured;
        }

        $fallbackPath = (string) config('knowledge-templates.ai.fallback_env_path');

        if ($fallbackPath === '' || ! is_file($fallbackPath)) {
            return null;
        }

        $variables = $this->parseEnvFile($fallbackPath);
        $baseUrl = $configured['base_url'] ?: ($variables['OPENAI_BASE_URL'] ?? null);
        $apiKey = $configured['api_key'] ?: ($variables['OPENAI_API_KEY'] ?? null);
        $model = $configured['model'] ?: ($variables['OPENAI_MODEL'] ?? null);

        if (! is_string($baseUrl) || ! is_string($apiKey) || ! is_string($model)) {
            return null;
        }

        return [
            'base_url' => $baseUrl,
            'api_key' => $apiKey,
            'model' => $model,
            'timeout' => $configured['timeout'],
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function parseEnvFile(string $path): array
    {
        $variables = [];

        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            if (! is_string($line) || $line === '' || str_starts_with(trim($line), '#') || ! str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);

            if ($key === '') {
                continue;
            }

            $variables[$key] = trim($value, " \t\n\r\0\x0B\"'");
        }

        return $variables;
    }

    protected function normalizeContent(mixed $content): string
    {
        if (is_string($content)) {
            return trim($content);
        }

        if (! is_array($content)) {
            return '';
        }

        return collect($content)
            ->map(function (mixed $item): string {
                if (! is_array($item)) {
                    return '';
                }

                return (string) ($item['text'] ?? $item['content'] ?? '');
            })
            ->implode("\n");
    }

    protected function extractJsonObject(string $content): string
    {
        $start = strpos($content, '{');
        $end = strrpos($content, '}');

        if ($start === false || $end === false || $end < $start) {
            throw new RuntimeException('AI 返回结果中未找到 JSON 对象。');
        }

        return substr($content, $start, $end - $start + 1);
    }
}
