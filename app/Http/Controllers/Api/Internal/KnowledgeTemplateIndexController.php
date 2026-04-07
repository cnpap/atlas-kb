<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Http\Resources\Internal\InternalKnowledgeTemplateSummaryResource;
use App\Models\KnowledgeUser;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class KnowledgeTemplateIndexController extends Controller
{
    public function __invoke(Request $request): AnonymousResourceCollection
    {
        $user = KnowledgeUser::query()->findOrFail((int) $request->integer('user_id'));

        $templates = $user->assignedKnowledgeTemplates()
            ->available()
            ->withCount(['fields', 'referenceLibraries'])
            ->get();

        return InternalKnowledgeTemplateSummaryResource::collection($templates);
    }
}
