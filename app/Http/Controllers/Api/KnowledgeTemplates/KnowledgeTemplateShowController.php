<?php

namespace App\Http\Controllers\Api\KnowledgeTemplates;

use App\Http\Controllers\Controller;
use App\Http\Resources\KnowledgeTemplateDetailResource;
use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeUser;

class KnowledgeTemplateShowController extends Controller
{
    public function __invoke(
        KnowledgeUser $knowledgeUser,
        KnowledgeTemplate $assignedKnowledgeTemplate,
    ): KnowledgeTemplateDetailResource {
        $assignedKnowledgeTemplate->loadCount(['fields', 'referenceLibraries'])
            ->load(['fields', 'referenceLibraries.files']);

        return KnowledgeTemplateDetailResource::make($assignedKnowledgeTemplate);
    }
}
