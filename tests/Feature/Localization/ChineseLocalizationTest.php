<?php

test('the application defaults to simplified chinese', function () {
    expect(app()->getLocale())->toBe('zh_CN');
    expect(__('Settings'))->toBe('设置');
    expect(__('auth.failed'))->toBe('用户名或密码错误。');
    expect(__('filament-panels::auth/pages/login.multi_factor.heading'))->toBe('验证您的身份');
    expect(__('filament-forms::components.rich_editor.tools.h4'))->toBe('标题 4');
    expect(__('filament::components/pagination.actions.first.label'))->toBe('第一页');
});

test('the filament login page is rendered in simplified chinese', function () {
    $response = $this->get(route('filament.admin.auth.login'));

    $response->assertOk();
    $response->assertSee('登录');
    $response->assertSee('邮箱地址');
    $response->assertSee('密码');
});

test('failed authentication messages are translated to simplified chinese', function () {
    $response = $this->from(route('filament.admin.auth.login'))->post(route('login.store'), [
        'email' => 'missing@example.com',
        'password' => 'invalid-password',
    ]);

    $response
        ->assertRedirect(route('filament.admin.auth.login'))
        ->assertSessionHasErrors([
            'email' => __('auth.failed'),
        ]);
});
