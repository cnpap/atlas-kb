<?php

namespace App\Http\Resources\Internal;

use DateTimeInterface;

trait FormatsAtlasKbTimestamp
{
    protected function formatAtlasKbTimestamp(?DateTimeInterface $value): ?string
    {
        return $value?->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    }
}
