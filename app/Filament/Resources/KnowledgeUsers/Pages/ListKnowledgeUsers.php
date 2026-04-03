<?php

namespace App\Filament\Resources\KnowledgeUsers\Pages;

use App\Filament\Resources\KnowledgeUsers\KnowledgeUserResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListKnowledgeUsers extends ListRecords
{
    protected static string $resource = KnowledgeUserResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
