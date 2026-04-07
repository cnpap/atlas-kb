<?php

namespace App\Filament\Resources\KnowledgeTemplateLibraries\Pages;

use App\Filament\Resources\KnowledgeTemplateLibraries\KnowledgeTemplateLibraryResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditKnowledgeTemplateLibrary extends EditRecord
{
    protected static string $resource = KnowledgeTemplateLibraryResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make()
                ->label('删除')
                ->modalHeading('删除模板资料库')
                ->modalDescription('删除后将同时清理对象存储中的资料文件，并解除模板关联。')
                ->modalSubmitActionLabel('确认删除'),
        ];
    }
}
