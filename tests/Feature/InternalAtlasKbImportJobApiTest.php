<?php

use App\Jobs\DrainAtlasKbImportJobs;
use Illuminate\Support\Facades\Queue;

function atlasKbImportInternalHeaders(): array
{
    config()->set('atlas-kb.internal_secret', 'atlas-kb-test-secret');

    return [
        'X-Atlas-Kb-Internal-Secret' => 'atlas-kb-test-secret',
    ];
}

test('internal atlas kb import dispatch enqueues the drain job', function () {
    Queue::fake();

    $response = $this
        ->withHeaders(atlasKbImportInternalHeaders())
        ->postJson('/api/internal/atlas-kb-import-jobs/dispatch');

    $response->assertAccepted()
        ->assertJsonPath('data.queued', true);

    Queue::assertPushed(DrainAtlasKbImportJobs::class);
});
