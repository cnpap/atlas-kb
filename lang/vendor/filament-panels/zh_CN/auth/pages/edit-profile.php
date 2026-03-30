<?php

return [
    'form' => [
        'password' => [
            'validation_attribute' => '密码',
        ],
        'password_confirmation' => [
            'validation_attribute' => '确认密码',
        ],
    ],
    'multi_factor_authentication' => [
        'label' => '两步验证 (2FA)',
    ],
    'notifications' => [
        'email_change_verification_sent' => [
            'title' => '邮箱地址变更请求已发送',
            'body' => '变更邮箱地址的请求已发送到 :email。请检查您的邮箱以验证此次变更。',
        ],
        'throttled' => [
            'title' => '请求次数过多，请在 :seconds 秒后再试。',
            'body' => '请在 :seconds 秒后再试。',
        ],
    ],
];
