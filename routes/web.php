<?php

use App\Http\Controllers\KnowledgeTemplateDownloadController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect('/admin'))->name('home');
Route::get('dashboard', fn () => redirect('/admin'))->name('dashboard');
Route::get('login', fn () => redirect('/admin/login'))->name('login');
Route::get('register', fn () => redirect('/admin'))->name('register');
Route::get('forgot-password', fn () => redirect('/admin'))->name('password.request');
Route::get('reset-password/{token}', fn (string $token) => redirect('/admin'))->name('password.reset');
Route::get('email/verify', fn () => redirect('/admin'))->name('verification.notice');
Route::get('email/verify/{id}/{hash}', fn (string $id, string $hash) => redirect('/admin'))->name('verification.verify');
Route::get('two-factor-challenge', fn () => redirect('/admin'))->name('two-factor.login');
Route::get('user/confirm-password', fn () => redirect('/admin'))->name('password.confirm');
Route::get('user/confirmed-password-status', fn () => redirect('/admin'))->name('password.confirmation');
Route::middleware(['auth', 'can:view,knowledgeTemplate'])->get('admin/knowledge-templates/{knowledgeTemplate}/download', KnowledgeTemplateDownloadController::class)
    ->name('admin.knowledge-templates.download');
Route::get('user/{any}', fn (string $any) => redirect('/admin'))->where('any', '.*');

require __DIR__.'/settings.php';
