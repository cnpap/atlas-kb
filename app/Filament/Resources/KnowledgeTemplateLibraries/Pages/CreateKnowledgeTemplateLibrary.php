<?php

namespace App\Filament\Resources\KnowledgeTemplateLibraries\Pages;

use App\Filament\Resources\KnowledgeTemplateLibraries\KnowledgeTemplateLibraryResource;
use Filament\Resources\Pages\CreateRecord;

class CreateKnowledgeTemplateLibrary extends CreateRecord
{
    protected static string $resource = KnowledgeTemplateLibraryResource::class;

    protected function getRedirectUrl(): string
    {
        return static::getResource()::getUrl('edit', ['record' => $this->getRecord()]);
    }
}
