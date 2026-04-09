<?php

namespace App\Filament\Resources\KnowledgeAssistantRoles\Pages;

use App\Filament\Resources\KnowledgeAssistantRoles\KnowledgeAssistantRoleResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditKnowledgeAssistantRole extends EditRecord
{
    protected static string $resource = KnowledgeAssistantRoleResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
