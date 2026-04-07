<?php

namespace App\Http\Controllers\Api\KnowledgeTemplateExports;

use App\Http\Controllers\Controller;
use App\Http\Requests\IndexKnowledgeTemplateExportRequest;
use App\Http\Resources\KnowledgeTemplateExportResource;
use App\Models\KnowledgeTemplateExport;
use App\Models\User;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class KnowledgeTemplateExportIndexController extends Controller
{
    public function __invoke(User $user, IndexKnowledgeTemplateExportRequest $request): AnonymousResourceCollection
    {
        $exports = KnowledgeTemplateExport::query()
            ->where('owner_user_id', $user->getKey())
            ->with([
                'ownerUser',
                'template' => fn ($query) => $query->withCount('fields'),
            ])
            ->orderByDesc('created_at')
            ->paginate($request->perPage())
            ->withQueryString();

        return KnowledgeTemplateExportResource::collection($exports);
    }
}
