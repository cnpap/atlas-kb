<?php

namespace App\Filament\Resources\KnowledgeTemplateExports\Pages;

use App\Filament\Resources\KnowledgeTemplateExports\KnowledgeTemplateExportResource;
use Filament\Resources\Pages\ListRecords;

class ListKnowledgeTemplateExports extends ListRecords
{
    protected static string $resource = KnowledgeTemplateExportResource::class;

    protected function getHeaderActions(): array
    {
        return [];
    }
}
