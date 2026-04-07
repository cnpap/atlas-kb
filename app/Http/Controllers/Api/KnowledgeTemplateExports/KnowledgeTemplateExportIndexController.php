<?php

namespace App\Http\Controllers\Api\KnowledgeTemplateExports;

use App\Http\Controllers\Controller;
use App\Http\Requests\IndexKnowledgeTemplateExportRequest;
use App\Http\Resources\KnowledgeTemplateExportResource;
use App\Models\KnowledgeTemplateExport;
use App\Models\KnowledgeUser;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class KnowledgeTemplateExportIndexController extends Controller
{
    public function __invoke(KnowledgeUser $knowledgeUser, IndexKnowledgeTemplateExportRequest $request): AnonymousResourceCollection
    {
        $exports = KnowledgeTemplateExport::query()
            ->where('owner_user_id', $knowledgeUser->getKey())
            ->with([
                'ownerUser',
                'template' => fn ($query) => $query->withCount(['fields', 'referenceLibraries']),
            ])
            ->orderByDesc('created_at')
            ->paginate($request->perPage())
            ->withQueryString();

        return KnowledgeTemplateExportResource::collection($exports);
    }
}
