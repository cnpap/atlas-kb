<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Jobs\DrainAtlasKbImportJobs;
use Illuminate\Http\JsonResponse;

class AtlasKbImportJobDispatchController extends Controller
{
    public function __invoke(): JsonResponse
    {
        DrainAtlasKbImportJobs::dispatch()->afterCommit();

        return response()->json([
            'data' => [
                'queued' => true,
            ],
        ], 202);
    }
}
