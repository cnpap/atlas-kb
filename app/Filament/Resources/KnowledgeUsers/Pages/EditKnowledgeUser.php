<?php

namespace App\Filament\Resources\KnowledgeUsers\Pages;

use App\Filament\Resources\KnowledgeUsers\KnowledgeUserResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Facades\Hash;

class EditKnowledgeUser extends EditRecord
{
    protected static string $resource = KnowledgeUserResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make()
                ->requiresConfirmation()
                ->modalDescription('删除该知识库用户后，将级联删除其名下的知识库合集、资料源、导入任务、会话消息、反馈和导出记录。'),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeSave(array $data): array
    {
        if (blank($data['password'] ?? null)) {
            unset($data['password']);

            return $data;
        }

        $data['password_hash'] = Hash::driver('argon2id')->make($data['password']);

        unset($data['password']);

        return $data;
    }
}
