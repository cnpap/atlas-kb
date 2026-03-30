<?php

use Illuminate\Support\Facades\Route;

Route::get('settings', fn () => redirect('/admin'));
Route::get('settings/profile', fn () => redirect('/admin'))->name('profile.edit');
Route::get('settings/appearance', fn () => redirect('/admin'))->name('appearance.edit');
Route::get('settings/security', fn () => redirect('/admin'))->name('security.edit');
Route::get('settings/{any}', fn (string $any) => redirect('/admin'))->where('any', '.*');
