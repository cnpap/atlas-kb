<?php

use App\Models\User;
use App\Support\AdminRoles;

test('guests are redirected to the filament login page', function () {
    $response = $this->get(route('filament.admin.pages.dashboard'));

    $response->assertRedirect(route('filament.admin.auth.login'));
});

test('authenticated users without admin roles cannot access the filament admin panel', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(route('filament.admin.pages.dashboard'));

    $response->assertForbidden();
});

test('authenticated admin users can access the filament admin panel', function () {
    $user = createAdminUser(AdminRoles::SUPER_ADMIN);

    $response = $this->actingAs($user)->get(route('filament.admin.pages.dashboard'));

    $response->assertOk();
});
