<?php

return [
    'internal_secret' => env('ATLAS_KB_INTERNAL_SECRET'),
    'api_base_url' => rtrim((string) env('ATLAS_KB_PUBLIC_API_BASE_URL', 'http://127.0.0.1:4111'), '/'),
    'timeouts' => [
        'connect' => (int) env('ATLAS_KB_CONNECT_TIMEOUT', 10),
        'request' => (int) env('ATLAS_KB_REQUEST_TIMEOUT', 120),
    ],
];
