<?php

namespace App\Filament\Resources\KnowledgeUsers\Pages;

use App\Filament\Resources\KnowledgeUsers\KnowledgeUserResource;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Support\Facades\Hash;

class CreateKnowledgeUser extends CreateRecord
{
    protected static string $resource = KnowledgeUserResource::class;

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $data['password_hash'] = Hash::driver('argon2id')->make($data['password']);

        unset($data['password']);

        return $data;
    }
}
