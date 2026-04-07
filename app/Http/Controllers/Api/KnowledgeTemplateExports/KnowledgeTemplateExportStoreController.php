<?php

namespace App\Http\Controllers\Api\KnowledgeTemplateExports;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreKnowledgeTemplateExportRequest;
use App\Http\Resources\KnowledgeTemplateExportResource;
use App\Models\KnowledgeTemplate;
use App\Models\User;
use App\Support\KnowledgeTemplates\TemplateExportService;
use Illuminate\Http\JsonResponse;

class KnowledgeTemplateExportStoreController extends Controller
{
    public function __invoke(
        User $user,
        KnowledgeTemplate $availableKnowledgeTemplate,
        StoreKnowledgeTemplateExportRequest $request,
        TemplateExportService $templateExportService,
    ): JsonResponse {
        $export = $templateExportService->create(
            $availableKnowledgeTemplate,
            $user,
            $request->parameters($availableKnowledgeTemplate),
        );

        $export->load([
            'ownerUser',
            'template' => fn ($query) => $query->withCount('fields'),
        ]);

        return KnowledgeTemplateExportResource::make($export)
            ->response()
            ->setStatusCode(201);
    }
}
