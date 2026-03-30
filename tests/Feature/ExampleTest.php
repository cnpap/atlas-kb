<?php

test('returns a successful response', function () {
    $response = $this->get(route('home'));

    $response->assertRedirect(route('filament.admin.pages.dashboard', absolute: false));
});
