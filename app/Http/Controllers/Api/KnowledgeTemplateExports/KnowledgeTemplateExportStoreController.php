<?php

namespace App\Http\Controllers\Api\KnowledgeTemplateExports;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreKnowledgeTemplateExportRequest;
use App\Http\Resources\KnowledgeTemplateExportResource;
use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeUser;
use App\Support\KnowledgeTemplates\TemplateExportService;
use Illuminate\Http\JsonResponse;

class KnowledgeTemplateExportStoreController extends Controller
{
    public function __invoke(
        KnowledgeUser $knowledgeUser,
        KnowledgeTemplate $assignedKnowledgeTemplate,
        StoreKnowledgeTemplateExportRequest $request,
        TemplateExportService $templateExportService,
    ): JsonResponse {
        $export = $templateExportService->create(
            $assignedKnowledgeTemplate,
            $knowledgeUser,
            $request->parameters($assignedKnowledgeTemplate),
        );

        $export->load([
            'ownerUser',
            'template' => fn ($query) => $query->withCount(['fields', 'referenceLibraries']),
        ]);

        return KnowledgeTemplateExportResource::make($export)
            ->response()
            ->setStatusCode(201);
    }
}
