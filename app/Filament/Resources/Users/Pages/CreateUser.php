<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Models\User;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Database\Eloquent\Model;

class CreateUser extends CreateRecord
{
    protected static string $resource = UserResource::class;

    /**
     * @var list<string>
     */
    protected array $pendingRoleNames = [];

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $this->pendingRoleNames = array_values($data['role_names'] ?? []);

        unset($data['role_names']);

        return $data;
    }

    protected function handleRecordCreation(array $data): Model
    {
        /** @var Model&User $record */
        $record = parent::handleRecordCreation($data);
        $record->syncRoles($this->pendingRoleNames);

        return $record;
    }
}
