<?php

namespace App\Http\Controllers\Api\KnowledgeTemplates;

use App\Http\Controllers\Controller;
use App\Http\Resources\KnowledgeTemplateSummaryResource;
use App\Models\KnowledgeTemplate;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class KnowledgeTemplateIndexController extends Controller
{
    public function __invoke(): AnonymousResourceCollection
    {
        $templates = KnowledgeTemplate::query()
            ->available()
            ->withCount('fields')
            ->orderByDesc('updated_at')
            ->get();

        return KnowledgeTemplateSummaryResource::collection($templates);
    }
}
