<?php

namespace App\Support;

use App\Filament\Resources\KnowledgeAssistantRoles\KnowledgeAssistantRoleResource;
use App\Filament\Resources\KnowledgeTemplateExports\KnowledgeTemplateExportResource;
use App\Filament\Resources\KnowledgeTemplateLibraries\KnowledgeTemplateLibraryResource;
use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use App\Filament\Resources\KnowledgeUsers\KnowledgeUserResource;
use App\Filament\Resources\Users\UserResource;
use App\Models\User;
use BezhanSalleh\FilamentShield\Facades\FilamentShield;
use BezhanSalleh\FilamentShield\Support\Utils;
use Filament\Facades\Filament;
use Filament\Pages\Dashboard;
use Illuminate\Support\Collection;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class AdminAuthorizationBootstrapper
{
    public function __construct(private readonly PermissionRegistrar $permissionRegistrar) {}

    public function bootstrap(): void
    {
        $this->ensurePermissions();
        $this->ensureRoles();
        $this->syncDefaultRolePermissions();
        $this->permissionRegistrar->forgetCachedPermissions();
    }

    public function userCanAccessAdminPanel(User $user): bool
    {
        return $user->hasAnyRole(AdminRoles::all());
    }

    public function isLastSuperAdmin(User $user): bool
    {
        if (! $user->hasRole(AdminRoles::SUPER_ADMIN)) {
            return false;
        }

        return User::query()
            ->role(AdminRoles::SUPER_ADMIN)
            ->whereKeyNot($user->getKey())
            ->doesntExist();
    }

    /**
     * @return list<string>
     */
    public function administratorPermissions(): array
    {
        return $this->pagePermissions([
            Dashboard::class,
        ])
            ->merge($this->resourcePermissions([
                KnowledgeAssistantRoleResource::class,
                KnowledgeTemplateResource::class,
                KnowledgeTemplateExportResource::class,
                KnowledgeTemplateLibraryResource::class,
                KnowledgeUserResource::class,
                UserResource::class,
            ]))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return list<string>
     */
    public function readOnlyAdministratorPermissions(): array
    {
        return $this->pagePermissions([
            Dashboard::class,
        ])
            ->merge($this->resourcePermissions(
                resources: [
                    KnowledgeAssistantRoleResource::class,
                    KnowledgeTemplateResource::class,
                    KnowledgeTemplateExportResource::class,
                    KnowledgeTemplateLibraryResource::class,
                    KnowledgeUserResource::class,
                ],
                actions: ['viewAny', 'view'],
            ))
            ->unique()
            ->values()
            ->all();
    }

    private function ensurePermissions(): void
    {
        foreach (array_keys(FilamentShield::getResources() ?? []) as $resource) {
            Utils::generateForResource($resource);
        }

        foreach ($this->pagePermissionKeys() as $permission) {
            Utils::generateForPageOrWidget($permission);
        }

        Utils::generateForExtraPermissions();

        $this->permissionRegistrar->forgetCachedPermissions();
    }

    private function ensureRoles(): void
    {
        foreach (AdminRoles::all() as $roleName) {
            Role::findOrCreate($roleName, $this->guardName());
        }
    }

    private function syncDefaultRolePermissions(): void
    {
        $guardName = $this->guardName();

        Role::findByName(AdminRoles::SUPER_ADMIN, $guardName)->syncPermissions(
            Permission::query()
                ->where('guard_name', $guardName)
                ->pluck('name')
                ->all(),
        );

        Role::findByName(AdminRoles::ADMINISTRATOR, $guardName)->syncPermissions(
            $this->administratorPermissions(),
        );

        Role::findByName(AdminRoles::READ_ONLY_ADMINISTRATOR, $guardName)->syncPermissions(
            $this->readOnlyAdministratorPermissions(),
        );
    }

    private function guardName(): string
    {
        return Filament::getPanel('admin')?->getAuthGuard() ?? config('auth.defaults.guard', 'web');
    }

    /**
     * @param  list<class-string>  $resources
     * @param  list<string>|null  $actions
     * @return Collection<int, string>
     */
    private function resourcePermissions(array $resources, ?array $actions = null): Collection
    {
        return collect($resources)
            ->flatMap(function (string $resource) use ($actions): array {
                $permissions = collect(FilamentShield::getResourcePolicyActionsWithPermissions($resource) ?? []);

                if (is_array($actions)) {
                    $permissions = $permissions->only($actions);
                }

                return $permissions->values()->all();
            });
    }

    /**
     * @param  list<class-string>  $pages
     * @return Collection<int, string>
     */
    private function pagePermissions(array $pages): Collection
    {
        return collect($pages)
            ->flatMap(function (string $page): array {
                /** @var array<string, array<string, string>> $configuredPage */
                $configuredPage = data_get(FilamentShield::getPages(), $page, []);

                return array_keys($configuredPage['permissions'] ?? []);
            });
    }

    /**
     * @return Collection<int, string>
     */
    private function pagePermissionKeys(): Collection
    {
        return collect(FilamentShield::getPages() ?? [])
            ->flatMap(fn (array $page): array => array_keys($page['permissions'] ?? []));
    }
}
