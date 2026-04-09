<?php

namespace App\Filament\Resources\KnowledgeAssistantRoles\Pages;

use App\Filament\Resources\KnowledgeAssistantRoles\KnowledgeAssistantRoleResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListKnowledgeAssistantRoles extends ListRecords
{
    protected static string $resource = KnowledgeAssistantRoleResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
