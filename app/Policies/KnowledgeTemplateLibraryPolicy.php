<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\KnowledgeTemplateLibrary;
use Illuminate\Auth\Access\HandlesAuthorization;
use Illuminate\Foundation\Auth\User as AuthUser;

class KnowledgeTemplateLibraryPolicy
{
    use HandlesAuthorization;

    public function viewAny(AuthUser $authUser): bool
    {
        return $authUser->can('ViewAny:KnowledgeTemplateLibrary');
    }

    public function view(AuthUser $authUser, KnowledgeTemplateLibrary $knowledgeTemplateLibrary): bool
    {
        return $authUser->can('View:KnowledgeTemplateLibrary');
    }

    public function create(AuthUser $authUser): bool
    {
        return $authUser->can('Create:KnowledgeTemplateLibrary');
    }

    public function update(AuthUser $authUser, KnowledgeTemplateLibrary $knowledgeTemplateLibrary): bool
    {
        return $authUser->can('Update:KnowledgeTemplateLibrary');
    }

    public function delete(AuthUser $authUser, KnowledgeTemplateLibrary $knowledgeTemplateLibrary): bool
    {
        return $authUser->can('Delete:KnowledgeTemplateLibrary');
    }

    public function deleteAny(AuthUser $authUser): bool
    {
        return $authUser->can('DeleteAny:KnowledgeTemplateLibrary');
    }

    public function restore(AuthUser $authUser, KnowledgeTemplateLibrary $knowledgeTemplateLibrary): bool
    {
        return $authUser->can('Restore:KnowledgeTemplateLibrary');
    }

    public function forceDelete(AuthUser $authUser, KnowledgeTemplateLibrary $knowledgeTemplateLibrary): bool
    {
        return $authUser->can('ForceDelete:KnowledgeTemplateLibrary');
    }

    public function forceDeleteAny(AuthUser $authUser): bool
    {
        return $authUser->can('ForceDeleteAny:KnowledgeTemplateLibrary');
    }

    public function restoreAny(AuthUser $authUser): bool
    {
        return $authUser->can('RestoreAny:KnowledgeTemplateLibrary');
    }

    public function replicate(AuthUser $authUser, KnowledgeTemplateLibrary $knowledgeTemplateLibrary): bool
    {
        return $authUser->can('Replicate:KnowledgeTemplateLibrary');
    }

    public function reorder(AuthUser $authUser): bool
    {
        return $authUser->can('Reorder:KnowledgeTemplateLibrary');
    }
}
