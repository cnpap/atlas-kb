<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateField;
use Illuminate\Support\Facades\DB;
use Throwable;

class TemplateSyncService
{
    public function __construct(
        protected TemplateFileManager $fileManager,
        protected TemplateParser $parser,
        protected TemplateFieldDraftGenerator $draftGenerator,
    ) {}

    public function parseAndSync(KnowledgeTemplate $template, string $expectedChecksum): void
    {
        if (! $this->hasMatchingChecksum($template, $expectedChecksum)) {
            return;
        }

        KnowledgeTemplate::query()
            ->whereKey($template->getKey())
            ->where('checksum_sha256', $expectedChecksum)
            ->update([
                'parse_status' => KnowledgeTemplate::PARSE_STATUS_PROCESSING,
                'parse_error' => null,
            ]);

        try {
            $contents = $this->fileManager->readStoredBytes($template);
            $parsed = $this->parser->parse($contents, $template->source_filename);

            DB::transaction(function () use ($template, $expectedChecksum, $parsed): void {
                $lockedTemplate = KnowledgeTemplate::query()
                    ->with('fields')
                    ->lockForUpdate()
                    ->find($template->getKey());

                if (! $this->hasMatchingChecksum($lockedTemplate, $expectedChecksum)) {
                    return;
                }

                $this->syncFields($lockedTemplate, $parsed['fields']);

                $lockedTemplate->forceFill([
                    'template_type' => $parsed['template_type'],
                    'parse_status' => KnowledgeTemplate::PARSE_STATUS_READY,
                    'parse_error' => null,
                    'parser_version' => (string) config('knowledge-templates.parser_version'),
                    'parsed_at' => now(),
                ])->save();
            });

            $freshTemplate = KnowledgeTemplate::query()
                ->with('fields')
                ->find($template->getKey());

            if ($this->hasMatchingChecksum($freshTemplate, $expectedChecksum)) {
                $this->refreshFieldDrafts($freshTemplate, $expectedChecksum);
            }
        } catch (Throwable $throwable) {
            report($throwable);
            $this->markFailed($template->getKey(), $expectedChecksum, $throwable);
        }
    }

    public function refreshFieldDrafts(KnowledgeTemplate $template, string $expectedChecksum): void
    {
        if (! $this->hasMatchingChecksum($template, $expectedChecksum)) {
            return;
        }

        $fields = $template->fields
            ->filter(fn (KnowledgeTemplateField $field): bool => $field->meta_source !== KnowledgeTemplateField::META_SOURCE_MANUAL)
            ->values();

        if ($fields->isEmpty()) {
            return;
        }

        $drafts = $this->draftGenerator->generate($template, $fields);

        DB::transaction(function () use ($template, $expectedChecksum, $drafts): void {
            $lockedTemplate = KnowledgeTemplate::query()
                ->with('fields')
                ->lockForUpdate()
                ->find($template->getKey());

            if (! $this->hasMatchingChecksum($lockedTemplate, $expectedChecksum)) {
                return;
            }

            foreach ($lockedTemplate->fields as $field) {
                if ($field->meta_source === KnowledgeTemplateField::META_SOURCE_MANUAL) {
                    continue;
                }

                $draft = $drafts[$field->name] ?? null;

                if (! is_array($draft)) {
                    continue;
                }

                $field->forceFill([
                    'label' => $draft['meta_source'] === KnowledgeTemplateField::META_SOURCE_AI
                        ? $draft['label']
                        : ($field->label ?: $draft['label']),
                    'description' => $draft['meta_source'] === KnowledgeTemplateField::META_SOURCE_AI
                        ? $draft['description']
                        : ($field->description ?: $draft['description']),
                    'meta_source' => $draft['meta_source'] === KnowledgeTemplateField::META_SOURCE_AI
                        ? KnowledgeTemplateField::META_SOURCE_AI
                        : ($field->meta_source ?: KnowledgeTemplateField::META_SOURCE_DEFAULT),
                ])->save();
            }
        });
    }

    /**
     * @param  list<array{name: string, sort_order: int, locations: list<array<string, string>>}>  $parsedFields
     */
    protected function syncFields(KnowledgeTemplate $template, array $parsedFields): void
    {
        $existingFields = $template->fields->keyBy('name');
        $names = [];

        foreach ($parsedFields as $parsedField) {
            $names[] = $parsedField['name'];
            $existingField = $existingFields->get($parsedField['name']);

            if ($existingField instanceof KnowledgeTemplateField) {
                $existingField->forceFill([
                    'sort_order' => $parsedField['sort_order'],
                    'locations_json' => $parsedField['locations'],
                    'label' => $existingField->label ?: $this->draftGenerator->humanizeFieldName($parsedField['name']),
                ])->save();

                continue;
            }

            $template->fields()->create([
                'name' => $parsedField['name'],
                'label' => $this->draftGenerator->humanizeFieldName($parsedField['name']),
                'description' => null,
                'meta_source' => KnowledgeTemplateField::META_SOURCE_DEFAULT,
                'sort_order' => $parsedField['sort_order'],
                'locations_json' => $parsedField['locations'],
            ]);
        }

        $template->fields()
            ->whereNotIn('name', $names)
            ->delete();
    }

    protected function markFailed(string $templateId, string $expectedChecksum, Throwable $throwable): void
    {
        KnowledgeTemplate::query()
            ->whereKey($templateId)
            ->where('checksum_sha256', $expectedChecksum)
            ->update([
                'parse_status' => KnowledgeTemplate::PARSE_STATUS_FAILED,
                'parse_error' => $throwable->getMessage(),
            ]);
    }

    protected function hasMatchingChecksum(?KnowledgeTemplate $template, string $expectedChecksum): bool
    {
        return $template instanceof KnowledgeTemplate
            && $template->checksum_sha256 === $expectedChecksum;
    }
}
