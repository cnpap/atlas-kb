<?php

namespace App\Filament\Resources\KnowledgeTemplates\Pages;

use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use App\Jobs\ParseKnowledgeTemplate;
use App\Models\KnowledgeTemplate;
use App\Support\KnowledgeTemplates\TemplateFileManager;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;
use Throwable;

class EditKnowledgeTemplate extends EditRecord
{
    protected static string $resource = KnowledgeTemplateResource::class;

    protected ?TemporaryUploadedFile $pendingTemplateUpload = null;

    protected function getHeaderActions(): array
    {
        return [
            KnowledgeTemplateResource::makeDownloadAction(),
            KnowledgeTemplateResource::makeReparseAction(),
            KnowledgeTemplateResource::makeGenerateDraftsAction(),
            DeleteAction::make()
                ->label('删除')
                ->modalHeading('删除模板')
                ->modalSubmitActionLabel('确认删除'),
        ];
    }

    protected function mutateFormDataBeforeSave(array $data): array
    {
        $upload = $data['template_upload'] ?? null;

        if ($upload instanceof TemporaryUploadedFile) {
            $this->pendingTemplateUpload = $upload;
        }

        unset($data['template_upload']);
        $data['system_prompt'] = trim((string) ($data['system_prompt'] ?? ''));

        return $data;
    }

    protected function handleRecordUpdate(Model $record, array $data): Model
    {
        /** @var KnowledgeTemplate $record */
        $fileManager = app(TemplateFileManager::class);
        $storedFile = null;
        $previousDisk = $record->source_disk;
        $previousPath = $record->source_path;

        if ($this->pendingTemplateUpload instanceof TemporaryUploadedFile) {
            $storedFile = $fileManager->storeUpload($this->pendingTemplateUpload);
            $data = [
                ...$data,
                ...$storedFile,
                'parse_status' => KnowledgeTemplate::PARSE_STATUS_PENDING,
                'parse_error' => null,
                'parser_version' => (string) config('knowledge-templates.parser_version'),
                'parsed_at' => null,
            ];
        }

        try {
            DB::transaction(function () use ($record, $data, $storedFile): void {
                $record->update($data);

                if (is_array($storedFile)) {
                    ParseKnowledgeTemplate::dispatch($record->getKey(), $record->checksum_sha256)->afterCommit();
                }
            });
        } catch (Throwable $throwable) {
            if (is_array($storedFile)) {
                $fileManager->deleteStoredFile($storedFile['source_disk'], $storedFile['source_path']);
            }

            throw $throwable;
        }

        if (is_array($storedFile) && ($previousDisk !== $record->source_disk || $previousPath !== $record->source_path)) {
            try {
                $fileManager->deleteStoredFile($previousDisk, $previousPath);
            } catch (Throwable $throwable) {
                report($throwable);
            }
        }

        return $record;
    }
}
