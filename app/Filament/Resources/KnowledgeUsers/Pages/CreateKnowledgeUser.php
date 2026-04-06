<?php

namespace App\Filament\Resources\KnowledgeUsers\Pages;

use App\Filament\Resources\KnowledgeUsers\KnowledgeUserResource;
use Filament\Resources\Pages\CreateRecord;

class CreateKnowledgeUser extends CreateRecord
{
    protected static string $resource = KnowledgeUserResource::class;

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $username = (string) $data['username'];
        $data['name'] = $username;
        $data['email'] = null;

        return $data;
    }
}
