<?php

use App\Models\User;

test('guests are redirected to the filament login page', function () {
    $response = $this->get(route('filament.admin.pages.dashboard'));

    $response->assertRedirect(route('filament.admin.auth.login'));
});

test('authenticated users can access the filament admin panel', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(route('filament.admin.pages.dashboard'));

    $response->assertOk();
});
