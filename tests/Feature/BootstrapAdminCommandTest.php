<?php

use App\Models\KnowledgeUser;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

test('bootstrap admin command creates a default admin account', function () {
    $this->artisan('app:bootstrap-admin')
        ->expectsOutputToContain('已创建后台管理员：admin@example.com')
        ->assertSuccessful();

    $admin = User::query()->sole();

    expect($admin->name)->toBe('管理员')
        ->and($admin->email)->toBe('admin@example.com')
        ->and($admin->email_verified_at)->not->toBeNull()
        ->and(Hash::check('atlas-admin-dev', $admin->password))->toBeTrue();
});

test('bootstrap admin command can reset an existing admin password', function () {
    $admin = User::factory()->create([
        'name' => '旧管理员',
        'email' => 'admin@example.com',
        'password' => 'old-password',
    ]);

    $this->artisan('app:bootstrap-admin --name=系统管理员 --email=admin@example.com --password=new-password --reset-password')
        ->expectsOutputToContain('已更新后台管理员：admin@example.com')
        ->assertSuccessful();

    $admin->refresh();

    expect($admin->name)->toBe('系统管理员')
        ->and(Hash::check('new-password', $admin->password))->toBeTrue();
});

test('database seeder bootstraps admin and knowledge users together', function () {
    $this->seed();

    $admin = User::query()->where('email', 'admin@example.com')->sole();
    $knowledgeUser = KnowledgeUser::query()->where('username', 'admin')->sole();

    expect(Hash::check('atlas-admin-dev', $admin->password))->toBeTrue()
        ->and(Hash::driver('argon2id')->check('atlas-kb-dev', $knowledgeUser->getRawOriginal('password_hash')))->toBeTrue();
});
