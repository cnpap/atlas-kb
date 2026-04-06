<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Models\User;
use App\Support\AdminAuthorizationBootstrapper;
use App\Support\AdminRoles;
use Filament\Actions\DeleteAction;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;

class EditUser extends EditRecord
{
    protected static string $resource = UserResource::class;

    /**
     * @var list<string>
     */
    protected array $pendingRoleNames = [];

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make()
                ->label('删除')
                ->modalHeading('删除管理员用户')
                ->modalDescription('删除后，该账号将无法登录后台。')
                ->modalSubmitActionLabel('确认删除')
                ->requiresConfirmation()
                ->before(function (): void {
                    $record = $this->getRecord();

                    if (auth()->id() === $record->getKey()) {
                        Notification::make()
                            ->danger()
                            ->title('不能删除当前登录的管理员账号。')
                            ->send();

                        $this->halt();
                    }

                    if (app(AdminAuthorizationBootstrapper::class)->isLastSuperAdmin($record)) {
                        Notification::make()
                            ->danger()
                            ->title('系统至少需要保留一个超级管理员。')
                            ->send();

                        $this->halt();
                    }
                }),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeFill(array $data): array
    {
        $data['role_names'] = $this->getRecord()->roles->pluck('name')->all();

        return $data;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeSave(array $data): array
    {
        $this->pendingRoleNames = array_values($data['role_names'] ?? []);

        if (
            $this->getRecord()->hasRole(AdminRoles::SUPER_ADMIN)
            && ! in_array(AdminRoles::SUPER_ADMIN, $this->pendingRoleNames, true)
            && app(AdminAuthorizationBootstrapper::class)->isLastSuperAdmin($this->getRecord())
        ) {
            Notification::make()
                ->danger()
                ->title('系统至少需要保留一个超级管理员。')
                ->send();

            $this->halt();
        }

        unset($data['role_names']);

        if (blank($data['password'] ?? null)) {
            unset($data['password']);
        }

        return $data;
    }

    protected function afterSave(): void
    {
        /** @var User $record */
        $record = $this->getRecord();
        $record->syncRoles($this->pendingRoleNames);
    }
}
