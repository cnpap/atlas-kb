<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAtlasKbInternalRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $configuredSecret = trim((string) config('atlas-kb.internal_secret'));
        $providedSecret = trim((string) $request->header('X-Atlas-Kb-Internal-Secret'));

        abort_unless(
            $configuredSecret !== '' && hash_equals($configuredSecret, $providedSecret),
            401,
            'Internal authentication failed.',
        );

        return $next($request);
    }
}
