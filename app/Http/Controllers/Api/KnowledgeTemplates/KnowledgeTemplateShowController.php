<?php

namespace App\Http\Controllers\Api\KnowledgeTemplates;

use App\Http\Controllers\Controller;
use App\Http\Resources\KnowledgeTemplateDetailResource;
use App\Models\KnowledgeTemplate;

class KnowledgeTemplateShowController extends Controller
{
    public function __invoke(KnowledgeTemplate $availableKnowledgeTemplate): KnowledgeTemplateDetailResource
    {
        $availableKnowledgeTemplate
            ->loadCount('fields');

        return KnowledgeTemplateDetailResource::make($availableKnowledgeTemplate);
    }
}
