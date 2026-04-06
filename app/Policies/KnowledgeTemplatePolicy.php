<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\KnowledgeTemplate;
use Illuminate\Auth\Access\HandlesAuthorization;
use Illuminate\Foundation\Auth\User as AuthUser;

class KnowledgeTemplatePolicy
{
    use HandlesAuthorization;

    public function viewAny(AuthUser $authUser): bool
    {
        return $authUser->can('ViewAny:KnowledgeTemplate');
    }

    public function view(AuthUser $authUser, KnowledgeTemplate $knowledgeTemplate): bool
    {
        return $authUser->can('View:KnowledgeTemplate');
    }

    public function create(AuthUser $authUser): bool
    {
        return $authUser->can('Create:KnowledgeTemplate');
    }

    public function update(AuthUser $authUser, KnowledgeTemplate $knowledgeTemplate): bool
    {
        return $authUser->can('Update:KnowledgeTemplate');
    }

    public function delete(AuthUser $authUser, KnowledgeTemplate $knowledgeTemplate): bool
    {
        return $authUser->can('Delete:KnowledgeTemplate');
    }

    public function deleteAny(AuthUser $authUser): bool
    {
        return $authUser->can('DeleteAny:KnowledgeTemplate');
    }

    public function restore(AuthUser $authUser, KnowledgeTemplate $knowledgeTemplate): bool
    {
        return $authUser->can('Restore:KnowledgeTemplate');
    }

    public function forceDelete(AuthUser $authUser, KnowledgeTemplate $knowledgeTemplate): bool
    {
        return $authUser->can('ForceDelete:KnowledgeTemplate');
    }

    public function forceDeleteAny(AuthUser $authUser): bool
    {
        return $authUser->can('ForceDeleteAny:KnowledgeTemplate');
    }

    public function restoreAny(AuthUser $authUser): bool
    {
        return $authUser->can('RestoreAny:KnowledgeTemplate');
    }

    public function replicate(AuthUser $authUser, KnowledgeTemplate $knowledgeTemplate): bool
    {
        return $authUser->can('Replicate:KnowledgeTemplate');
    }

    public function reorder(AuthUser $authUser): bool
    {
        return $authUser->can('Reorder:KnowledgeTemplate');
    }
}
