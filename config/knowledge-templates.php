<?php

return [
    'storage_disk' => env('KB_TEMPLATE_STORAGE_DISK', 'kb_templates'),
    'storage_directory' => env('KB_TEMPLATE_STORAGE_DIRECTORY', 'kb/templates'),
    'parser_version' => env('KB_TEMPLATE_PARSER_VERSION', 'ooxml-v1'),
    'template_uploads' => [
        'max_upload_kb' => (int) env('KB_TEMPLATE_MAX_UPLOAD_KB', 102400),
    ],
    'exports' => [
        'disk' => env('KB_TEMPLATE_EXPORT_STORAGE_DISK', env('KB_TEMPLATE_STORAGE_DISK', 'kb_templates')),
        'directory' => env('KB_TEMPLATE_EXPORT_STORAGE_DIRECTORY', 'kb/template-exports'),
        'retention_days' => (int) env('KB_TEMPLATE_EXPORT_RETENTION_DAYS', 30),
    ],
    'reference_libraries' => [
        'disk' => env('KB_TEMPLATE_REFERENCE_LIBRARY_STORAGE_DISK', env('KB_TEMPLATE_STORAGE_DISK', 'kb_templates')),
        'max_upload_kb' => (int) env('KB_TEMPLATE_REFERENCE_LIBRARY_MAX_UPLOAD_KB', 102400),
    ],
    'ai' => [
        'enabled' => env('KB_TEMPLATE_AI_ENABLED', true),
        'base_url' => env('KB_TEMPLATE_AI_BASE_URL'),
        'api_key' => env('KB_TEMPLATE_AI_API_KEY'),
        'model' => env('KB_TEMPLATE_AI_MODEL'),
        'timeout' => (int) env('KB_TEMPLATE_AI_TIMEOUT', 60),
        'fallback_env_path' => env('KB_TEMPLATE_AI_FALLBACK_ENV_PATH', '/root/code/ops-agent-kit/.env'),
    ],
];
