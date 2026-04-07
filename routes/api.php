<?php

use App\Http\Controllers\Api\KnowledgeTemplateExports\KnowledgeTemplateExportIndexController;
use App\Http\Controllers\Api\KnowledgeTemplateExports\KnowledgeTemplateExportStoreController;
use App\Http\Controllers\Api\KnowledgeTemplates\KnowledgeTemplateIndexController;
use App\Http\Controllers\Api\KnowledgeTemplates\KnowledgeTemplateShowController;
use App\Http\Controllers\Api\Internal\KnowledgeTemplateExportTaskIndexController as InternalKnowledgeTemplateExportTaskIndexController;
use App\Http\Controllers\Api\Internal\KnowledgeTemplateExportTaskStoreController as InternalKnowledgeTemplateExportTaskStoreController;
use App\Http\Controllers\Api\Internal\KnowledgeTemplateIndexController as InternalKnowledgeTemplateIndexController;
use App\Http\Controllers\Api\Internal\KnowledgeTemplateShowController as InternalKnowledgeTemplateShowController;
use App\Http\Middleware\EnsureAtlasKbInternalRequest;
use Illuminate\Support\Facades\Route;

Route::prefix('users/{knowledgeUser}')->group(function (): void {
    Route::middleware('throttle:knowledge-template-read')->group(function (): void {
        Route::get('knowledge-templates', KnowledgeTemplateIndexController::class)
            ->name('api.users.knowledge-templates.index');
        Route::get('knowledge-templates/{assignedKnowledgeTemplate}', KnowledgeTemplateShowController::class)
            ->name('api.users.knowledge-templates.show');
    });

    Route::get('knowledge-template-exports', KnowledgeTemplateExportIndexController::class)
        ->middleware('throttle:knowledge-template-export-list')
        ->name('api.users.knowledge-template-exports.index');

    Route::post('knowledge-templates/{assignedKnowledgeTemplate}/exports', KnowledgeTemplateExportStoreController::class)
        ->middleware('throttle:knowledge-template-export-create')
        ->name('api.users.knowledge-template-exports.store');
});

Route::prefix('internal')
    ->middleware(EnsureAtlasKbInternalRequest::class)
    ->group(function (): void {
        Route::get('knowledge-templates', InternalKnowledgeTemplateIndexController::class);
        Route::get('knowledge-templates/{templateId}', InternalKnowledgeTemplateShowController::class);
        Route::get('knowledge-template-export-tasks', InternalKnowledgeTemplateExportTaskIndexController::class);
        Route::post('knowledge-template-export-tasks', InternalKnowledgeTemplateExportTaskStoreController::class);
    });
