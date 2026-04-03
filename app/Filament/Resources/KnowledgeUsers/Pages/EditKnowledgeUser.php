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
                ->modalDescription('Deleting this knowledge user will cascade-delete all of their KB collections, sources, imports, chats, feedback, and exports.'),
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
