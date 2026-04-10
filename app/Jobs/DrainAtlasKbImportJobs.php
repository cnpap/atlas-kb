<?php

namespace App\Jobs;

use App\Support\AtlasKb\AtlasKbAgentClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class DrainAtlasKbImportJobs implements ShouldQueue
{
    use Queueable;

    public function handle(AtlasKbAgentClient $agentClient): void
    {
        $result = $agentClient->processNextImportJob();

        if (! ($result['processed'] ?? false)) {
            return;
        }

        if (($result['sourceStatus'] ?? null) === 'processing') {
            return;
        }

        static::dispatch()
            ->onConnection($this->connection)
            ->onQueue($this->queue);
    }
}
