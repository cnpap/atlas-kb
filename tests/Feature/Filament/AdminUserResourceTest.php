<?php

use App\Filament\Resources\Users\Pages\CreateUser;
use App\Filament\Resources\Users\Pages\EditUser;
use App\Filament\Resources\Users\UserResource;
use App\Models\User;
use App\Support\AdminRoles;
use Illuminate\Support\Facades\Hash;
use Livewire\Livewire;

test('super admins can access the admin user resource', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(UserResource::getUrl());

    $response->assertOk();
});

test('read only admins cannot access the admin user resource', function () {
    $admin = createAdminUser(AdminRoles::READ_ONLY_ADMINISTRATOR);

    $response = $this->actingAs($admin)->get(UserResource::getUrl());

    $response->assertForbidden();
});

test('admin user create page is rendered in simplified chinese', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(UserResource::getUrl('create'));

    $response->assertOk();
    $response->assertSee('管理员用户');
    $response->assertSee('姓名');
    $response->assertSee('邮箱');
    $response->assertSee('角色');
});

test('admin users can create another admin user from filament', function () {
    $admin = createAdminUser();

    $this->actingAs($admin);

    Livewire::test(CreateUser::class)
        ->assertOk()
        ->fillForm([
            'name' => '内容运营',
            'email' => 'ops@example.com',
            'password' => 'new-secret-password',
            'role_names' => [AdminRoles::ADMINISTRATOR],
        ])
        ->call('create')
        ->assertHasNoFormErrors()
        ->assertRedirect();

    $user = User::query()->where('email', 'ops@example.com')->sole();

    expect($user->name)->toBe('内容运营')
        ->and(Hash::check('new-secret-password', $user->password))->toBeTrue()
        ->and($user->hasRole(AdminRoles::ADMINISTRATOR))->toBeTrue();
});

test('editing an admin user keeps the password hash when password is blank', function () {
    $admin = createAdminUser();
    $managedUser = createAdminUser(AdminRoles::ADMINISTRATOR, [
        'email' => 'editor@example.com',
    ]);
    $originalPasswordHash = $managedUser->password;

    $this->actingAs($admin);

    Livewire::test(EditUser::class, ['record' => $managedUser->getKey()])
        ->assertOk()
        ->fillForm([
            'name' => '新管理员',
            'email' => 'editor@example.com',
            'password' => '',
            'role_names' => [AdminRoles::ADMINISTRATOR],
        ])
        ->call('save')
        ->assertHasNoFormErrors();

    $managedUser->refresh();

    expect($managedUser->name)->toBe('新管理员')
        ->and($managedUser->password)->toBe($originalPasswordHash)
        ->and($managedUser->hasRole(AdminRoles::ADMINISTRATOR))->toBeTrue();
});

test('an admin user cannot delete their own account', function () {
    $admin = createAdminUser();

    $this->actingAs($admin);

    Livewire::test(EditUser::class, ['record' => $admin->getKey()])
        ->callAction('delete')
        ->assertActionHalted('delete');

    expect(User::query()->whereKey($admin->getKey())->exists())->toBeTrue();
});

test('the last super admin cannot be demoted', function () {
    $admin = createAdminUser();

    $this->actingAs($admin);

    Livewire::test(EditUser::class, ['record' => $admin->getKey()])
        ->fillForm([
            'name' => $admin->name,
            'email' => $admin->email,
            'password' => '',
            'role_names' => [AdminRoles::ADMINISTRATOR],
        ])
        ->call('save');

    $admin->refresh();

    expect($admin->hasRole(AdminRoles::SUPER_ADMIN))->toBeTrue();
});
