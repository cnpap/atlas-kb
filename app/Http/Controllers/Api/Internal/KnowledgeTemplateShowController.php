<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Http\Resources\Internal\InternalKnowledgeTemplateDetailResource;
use App\Models\KnowledgeUser;
use Illuminate\Http\Request;

class KnowledgeTemplateShowController extends Controller
{
    public function __invoke(Request $request, string $templateId): InternalKnowledgeTemplateDetailResource
    {
        $user = KnowledgeUser::query()->findOrFail((int) $request->integer('user_id'));

        $template = $user->assignedKnowledgeTemplates()
            ->available()
            ->where('kb_templates.id', $templateId)
            ->withCount(['fields', 'referenceLibraries'])
            ->with(['fields', 'referenceLibraries.files'])
            ->firstOrFail();

        return InternalKnowledgeTemplateDetailResource::make($template);
    }
}
