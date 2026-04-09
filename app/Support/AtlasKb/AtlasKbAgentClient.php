<?php

namespace App\Support\AtlasKb;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateExportTask;
use App\Models\KnowledgeUser;
use DateTimeInterface;
use Illuminate\Http\Client\Factory as HttpFactory;
use RuntimeException;

class AtlasKbAgentClient
{
    public function __construct(
        protected HttpFactory $http,
    ) {}

    /**
     * @return array{summary:string, parameters:array<string,string>, citations:array<int, array<string, mixed>>}
     */
    public function generateExportPayload(
        KnowledgeTemplateExportTask $task,
        KnowledgeTemplate $template,
        KnowledgeUser $user,
    ): array {
        $response = $this->http
            ->baseUrl((string) config('atlas-kb.api_base_url'))
            ->connectTimeout((int) config('atlas-kb.timeouts.connect'))
            ->timeout((int) config('atlas-kb.timeouts.request'))
            ->acceptJson()
            ->withHeaders([
                'X-Atlas-Kb-Internal-Secret' => (string) config('atlas-kb.internal_secret'),
            ])
            ->post('/api/kb/internal/template-export-tasks/generate', [
                'userId' => (string) $user->getKey(),
                'sourceId' => $task->source_id,
                'template' => [
                    'id' => $template->id,
                    'name' => $template->name,
                    'templateType' => $template->template_type,
                    'sourceFilename' => $template->source_filename,
                    'fieldCount' => $template->fields->count(),
                    'referenceLibraryCount' => $template->referenceLibraries->count(),
                    'parsedAt' => $this->formatAtlasKbTimestamp($template->parsed_at),
                    'updatedAt' => $this->formatAtlasKbTimestamp($template->updated_at),
                    'systemPrompt' => (string) $template->system_prompt,
                    'fields' => $template->fields->map(fn ($field): array => [
                        'id' => $field->id,
                        'name' => $field->name,
                        'label' => $field->label,
                        'description' => $field->description ?? '',
                        'sortOrder' => $field->sort_order,
                    ])->values()->all(),
                    'referenceLibraries' => $template->referenceLibraries->map(fn ($library): array => [
                        'id' => $library->id,
                        'name' => $library->name,
                        'storagePrefix' => $library->storage_prefix,
                        'fileCount' => $library->files->count(),
                    ])->values()->all(),
                ],
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('Atlas KB agent request failed: '.$response->status().' '.$response->body());
        }

        $data = $response->json('data.result');

        if (! is_array($data) || ! isset($data['parameters']) || ! is_array($data['parameters'])) {
            throw new RuntimeException('Atlas KB agent returned an invalid export payload.');
        }

        return [
            'summary' => (string) ($data['summary'] ?? ''),
            'parameters' => collect($data['parameters'])
                ->map(fn (mixed $value): string => is_scalar($value) || $value === null ? (string) $value : '')
                ->all(),
            'citations' => is_array($data['citations'] ?? null) ? $data['citations'] : [],
        ];
    }

    protected function formatAtlasKbTimestamp(?DateTimeInterface $value): ?string
    {
        return $value?->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    }
}
