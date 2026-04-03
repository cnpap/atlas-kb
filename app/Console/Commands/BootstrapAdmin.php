<?php

namespace App\Console\Commands;

use App\Support\BootstrapAdminAccount;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('app:bootstrap-admin {--name=} {--email=} {--password=} {--reset-password : 重置已存在管理员的密码}')]
#[Description('创建或更新后台管理员账户')]
class BootstrapAdmin extends Command
{
    public function __construct(private readonly BootstrapAdminAccount $bootstrapAdminAccount)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        try {
            $result = $this->bootstrapAdminAccount->bootstrap(
                name: $this->option('name'),
                email: $this->option('email'),
                password: $this->option('password'),
                resetPassword: (bool) $this->option('reset-password'),
            );
        } catch (\InvalidArgumentException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        if ($result['created']) {
            $this->info("已创建后台管理员：{$result['user']->email}");
            $this->line('默认密码：'.((string) ($this->option('password') ?: 'atlas-admin-dev')));

            return self::SUCCESS;
        }

        if ($result['password_reset']) {
            $this->info("已更新后台管理员：{$result['user']->email}");

            return self::SUCCESS;
        }

        $this->warn("后台管理员已存在：{$result['user']->email}");
        $this->line('如需重置密码，请附加 --reset-password 重新执行。');

        return self::SUCCESS;
    }
}
