<?php

return [
    'label' => '关闭',
    'modal' => [
        'heading' => '停用邮箱验证码',
        'description' => '您确定要停止接收邮箱验证码吗？停用后，您的账户将失去一层额外的安全保护。',
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
                'label' => '停用邮箱验证码',
            ],
        ],
    ],
    'notifications' => [
        'disabled' => [
            'title' => '邮箱验证码已停用',
        ],
    ],
];
