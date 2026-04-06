<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\KnowledgeUser;
use Illuminate\Auth\Access\HandlesAuthorization;
use Illuminate\Foundation\Auth\User as AuthUser;

class KnowledgeUserPolicy
{
    use HandlesAuthorization;

    public function viewAny(AuthUser $authUser): bool
    {
        return $authUser->can('ViewAny:KnowledgeUser');
    }

    public function view(AuthUser $authUser, KnowledgeUser $knowledgeUser): bool
    {
        return $authUser->can('View:KnowledgeUser');
    }

    public function create(AuthUser $authUser): bool
    {
        return $authUser->can('Create:KnowledgeUser');
    }

    public function update(AuthUser $authUser, KnowledgeUser $knowledgeUser): bool
    {
        return $authUser->can('Update:KnowledgeUser');
    }

    public function delete(AuthUser $authUser, KnowledgeUser $knowledgeUser): bool
    {
        return $authUser->can('Delete:KnowledgeUser');
    }

    public function deleteAny(AuthUser $authUser): bool
    {
        return $authUser->can('DeleteAny:KnowledgeUser');
    }

    public function restore(AuthUser $authUser, KnowledgeUser $knowledgeUser): bool
    {
        return $authUser->can('Restore:KnowledgeUser');
    }

    public function forceDelete(AuthUser $authUser, KnowledgeUser $knowledgeUser): bool
    {
        return $authUser->can('ForceDelete:KnowledgeUser');
    }

    public function forceDeleteAny(AuthUser $authUser): bool
    {
        return $authUser->can('ForceDeleteAny:KnowledgeUser');
    }

    public function restoreAny(AuthUser $authUser): bool
    {
        return $authUser->can('RestoreAny:KnowledgeUser');
    }

    public function replicate(AuthUser $authUser, KnowledgeUser $knowledgeUser): bool
    {
        return $authUser->can('Replicate:KnowledgeUser');
    }

    public function reorder(AuthUser $authUser): bool
    {
        return $authUser->can('Reorder:KnowledgeUser');
    }
}
