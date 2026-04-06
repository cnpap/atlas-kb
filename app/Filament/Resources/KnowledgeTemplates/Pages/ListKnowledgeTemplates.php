<?php

namespace App\Filament\Resources\KnowledgeTemplates\Pages;

use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListKnowledgeTemplates extends ListRecords
{
    protected static string $resource = KnowledgeTemplateResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make()
                ->label('新增模板'),
        ];
    }
}
