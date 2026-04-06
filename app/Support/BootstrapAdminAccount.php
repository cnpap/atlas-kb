<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

class BootstrapAdminAccount
{
    public function __construct(private readonly AdminAuthorizationBootstrapper $adminAuthorizationBootstrapper) {}

    /**
     * @return array{created: bool, password_reset: bool, user: User}
     */
    public function bootstrap(
        ?string $name = null,
        ?string $email = null,
        ?string $password = null,
        bool $resetPassword = false,
    ): array {
        $resolvedName = trim($name ?: '管理员');
        $resolvedEmail = strtolower(trim($email ?: 'admin@example.com'));
        $resolvedPassword = trim($password ?: 'atlas-admin-dev');

        if ($resolvedName === '' || $resolvedEmail === '' || $resolvedPassword === '') {
            throw new \InvalidArgumentException('管理员姓名、邮箱和密码不能为空。');
        }

        $this->adminAuthorizationBootstrapper->bootstrap();

        $admin = User::query()->where('email', $resolvedEmail)->first();

        if ($admin instanceof User) {
            $admin->forceFill([
                'name' => $resolvedName,
                'email_verified_at' => $admin->email_verified_at ?? now(),
            ])->save();

            if ($resetPassword) {
                $admin->forceFill([
                    'password' => Hash::make($resolvedPassword),
                ])->save();

                $admin->assignRole(AdminRoles::SUPER_ADMIN);

                return [
                    'created' => false,
                    'password_reset' => true,
                    'user' => $admin->fresh(),
                ];
            }

            $admin->assignRole(AdminRoles::SUPER_ADMIN);

            return [
                'created' => false,
                'password_reset' => false,
                'user' => $admin->fresh(),
            ];
        }

        /** @var User $createdAdmin */
        $createdAdmin = User::query()->forceCreate([
            'name' => $resolvedName,
            'email' => $resolvedEmail,
            'password' => $resolvedPassword,
            'email_verified_at' => now(),
        ]);

        $createdAdmin->assignRole(AdminRoles::SUPER_ADMIN);

        return [
            'created' => true,
            'password_reset' => false,
            'user' => $createdAdmin,
        ];
    }
}
