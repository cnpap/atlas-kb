<?php

namespace App\Filament\Resources\KnowledgeTemplateLibraries\Pages;

use App\Filament\Resources\KnowledgeTemplateLibraries\KnowledgeTemplateLibraryResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListKnowledgeTemplateLibraries extends ListRecords
{
    protected static string $resource = KnowledgeTemplateLibraryResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make()
                ->label('新增资料库'),
        ];
    }
}
