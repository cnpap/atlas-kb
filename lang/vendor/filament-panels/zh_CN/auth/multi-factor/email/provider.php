<?php

return [
    'management_schema' => [
        'actions' => [
            'label' => '邮箱验证码',
            'below_content' => '在登录时通过发送到您邮箱的一次性验证码来验证身份。',
            'messages' => [
                'enabled' => '已启用',
                'disabled' => '已停用',
            ],
        ],
    ],
    'login_form' => [
        'label' => '发送验证码到您的邮箱',
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
            ],
        ],
    ],
];
