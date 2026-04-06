<?php

namespace App\Support;

final class AdminRoles
{
    public const SUPER_ADMIN = '超级管理员';

    public const ADMINISTRATOR = '管理员';

    public const READ_ONLY_ADMINISTRATOR = '只读管理员';

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return [
            self::SUPER_ADMIN,
            self::ADMINISTRATOR,
            self::READ_ONLY_ADMINISTRATOR,
        ];
    }

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return collect(self::all())
            ->mapWithKeys(fn (string $role): array => [$role => $role])
            ->all();
    }
}
