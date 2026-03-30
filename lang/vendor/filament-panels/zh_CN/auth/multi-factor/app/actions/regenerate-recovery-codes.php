<?php

return [
    'label' => '重新生成恢复码',
    'modal' => [
        'heading' => '重新生成认证器应用恢复码',
        'description' => '如果您丢失了恢复码，可以在此重新生成。旧的恢复码将立即失效。',
        'form' => [
            'code' => [
                'label' => '输入认证器应用中的 6 位验证码',
                'validation_attribute' => '验证码',
                'messages' => [
                    'invalid' => '您输入的验证码无效。',
                ],
            ],
            'password' => [
                'label' => '或者输入当前密码',
                'validation_attribute' => '密码',
            ],
        ],
        'actions' => [
            'submit' => [
                'label' => '重新生成恢复码',
            ],
        ],
    ],
    'notifications' => [
        'regenerated' => [
            'title' => '新的认证器应用恢复码已生成',
        ],
    ],
    'show_new_recovery_codes' => [
        'modal' => [
            'heading' => '新的恢复码',
            'description' => '请将以下恢复码保存在安全的地方。它们只会显示一次，但如果您失去了对认证器应用的访问权限，就需要使用它们：',
            'actions' => [
                'submit' => [
                    'label' => '关闭',
                ],
            ],
        ],
    ],
];
