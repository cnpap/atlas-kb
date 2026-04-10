<?php

use App\Jobs\DrainAtlasKbImportJobs;
use App\Support\AtlasKb\AtlasKbAgentClient;
use Illuminate\Support\Facades\Queue;

test('drain atlas kb import job re-dispatches itself after completing a non-processing import', function () {
    Queue::fake();

    $agentClient = Mockery::mock(AtlasKbAgentClient::class);
    $agentClient
        ->shouldReceive('processNextImportJob')
        ->once()
        ->andReturn([
            'processed' => true,
            'jobId' => 'job-1',
            'sourceId' => 'source-1',
            'sourceStatus' => 'ready',
        ]);

    (new DrainAtlasKbImportJobs)->handle($agentClient);

    Queue::assertPushed(DrainAtlasKbImportJobs::class, 1);
});

test('drain atlas kb import job does not re-dispatch when atlas kb already scheduled the next processing step', function () {
    Queue::fake();

    $agentClient = Mockery::mock(AtlasKbAgentClient::class);
    $agentClient
        ->shouldReceive('processNextImportJob')
        ->once()
        ->andReturn([
            'processed' => true,
            'jobId' => 'job-1',
            'sourceId' => 'source-1',
            'sourceStatus' => 'processing',
        ]);

    (new DrainAtlasKbImportJobs)->handle($agentClient);

    Queue::assertNothingPushed();
});

test('drain atlas kb import job stops when there is no pending import to claim', function () {
    Queue::fake();

    $agentClient = Mockery::mock(AtlasKbAgentClient::class);
    $agentClient
        ->shouldReceive('processNextImportJob')
        ->once()
        ->andReturn([
            'processed' => false,
        ]);

    (new DrainAtlasKbImportJobs)->handle($agentClient);

    Queue::assertNothingPushed();
});
