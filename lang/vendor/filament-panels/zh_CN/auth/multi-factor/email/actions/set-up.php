<?php

return [
    'label' => '设置',
    'modal' => [
        'heading' => '设置邮箱验证码',
        'description' => '每次登录或执行敏感操作时，您都需要输入我们通过电子邮件发送给您的 6 位验证码。请检查您的邮箱，使用该验证码完成设置。',
        'form' => [
            'code' => [
                'label' => '输入我们通过电子邮件发送给您的 6 位验证码',
                'validation_attribute' => '验证码',
                'actions' => [
                    'resend' => [
                        'label' => '通过电子邮件发送新的验证码',
                        'notifications' => [
                            'resent' => [
                                'title' => '我们已通过电子邮件向您发送新的验证码',
                            ],
                            'throttled' => [
                                'title' => '重新发送次数过多，请稍后再请求新的验证码。',
                            ],
                        ],
                    ],
                ],
                'messages' => [
                    'invalid' => '您输入的验证码无效。',
                    'rate_limited' => '尝试次数过多，请稍后再试。',
                ],
            ],
        ],
        'actions' => [
            'submit' => [
                'label' => '启用邮箱验证码',
            ],
        ],
    ],
    'notifications' => [
        'enabled' => [
            'title' => '邮箱验证码已启用',
        ],
    ],
];
