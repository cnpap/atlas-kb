<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\KnowledgeTemplateExport;
use Illuminate\Auth\Access\HandlesAuthorization;
use Illuminate\Foundation\Auth\User as AuthUser;

class KnowledgeTemplateExportPolicy
{
    use HandlesAuthorization;

    public function viewAny(AuthUser $authUser): bool
    {
        return $authUser->can('ViewAny:KnowledgeTemplateExport');
    }

    public function view(AuthUser $authUser, KnowledgeTemplateExport $knowledgeTemplateExport): bool
    {
        return $authUser->can('View:KnowledgeTemplateExport');
    }
}
