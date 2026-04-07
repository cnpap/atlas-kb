<?php

namespace App\Http\Controllers\Api\KnowledgeTemplates;

use App\Http\Controllers\Controller;
use App\Http\Resources\KnowledgeTemplateSummaryResource;
use App\Models\KnowledgeUser;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class KnowledgeTemplateIndexController extends Controller
{
    public function __invoke(KnowledgeUser $knowledgeUser): AnonymousResourceCollection
    {
        $templates = $knowledgeUser->assignedKnowledgeTemplates()
            ->available()
            ->withCount(['fields', 'referenceLibraries'])
            ->orderByDesc('updated_at')
            ->get();

        return KnowledgeTemplateSummaryResource::collection($templates);
    }
}
