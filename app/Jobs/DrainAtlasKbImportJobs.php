<?php

namespace App\Jobs;

use App\Support\AtlasKb\AtlasKbAgentClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class DrainAtlasKbImportJobs implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public int $maxIterations = 8,
    ) {}

    public function handle(AtlasKbAgentClient $agentClient): void
    {
        for ($iteration = 0; $iteration < $this->maxIterations; $iteration++) {
            $result = $agentClient->processNextImportJob();

            if (! ($result['processed'] ?? false)) {
                return;
            }
        }
    }
}
