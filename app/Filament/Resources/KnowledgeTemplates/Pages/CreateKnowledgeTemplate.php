<?php

namespace App\Filament\Resources\KnowledgeTemplates\Pages;

use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use App\Jobs\ParseKnowledgeTemplate;
use App\Models\KnowledgeTemplate;
use App\Support\KnowledgeTemplates\TemplateFileManager;
use Filament\Resources\Pages\CreateRecord;
use Filament\Support\Enums\Width;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;
use Throwable;

class CreateKnowledgeTemplate extends CreateRecord
{
    protected static string $resource = KnowledgeTemplateResource::class;

    protected Width|string|null $maxContentWidth = Width::Full;

    protected ?TemporaryUploadedFile $pendingTemplateUpload = null;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $upload = $data['template_upload'] ?? null;

        if (! $upload instanceof TemporaryUploadedFile) {
            throw ValidationException::withMessages([
                'data.template_upload' => '请上传模板文件。',
            ]);
        }

        $this->pendingTemplateUpload = $upload;
        unset($data['template_upload']);
        $data['system_prompt'] = trim((string) ($data['system_prompt'] ?? ''));

        return $data;
    }

    protected function handleRecordCreation(array $data): Model
    {
        $fileManager = app(TemplateFileManager::class);
        $storedFile = $fileManager->storeUpload($this->pendingTemplateUpload);

        try {
            return DB::transaction(function () use ($data, $storedFile): KnowledgeTemplate {
                $template = KnowledgeTemplate::query()->create([
                    ...$data,
                    ...$storedFile,
                    'parse_status' => KnowledgeTemplate::PARSE_STATUS_PENDING,
                    'parse_error' => null,
                    'parser_version' => (string) config('knowledge-templates.parser_version'),
                    'parsed_at' => null,
                ]);

                ParseKnowledgeTemplate::dispatch($template->getKey(), $template->checksum_sha256)->afterCommit();

                return $template;
            });
        } catch (Throwable $throwable) {
            $fileManager->deleteStoredFile($storedFile['source_disk'], $storedFile['source_path']);

            throw $throwable;
        }
    }
}
