<?php

use App\Http\Controllers\Api\KnowledgeTemplateExports\KnowledgeTemplateExportIndexController;
use App\Http\Controllers\Api\KnowledgeTemplateExports\KnowledgeTemplateExportStoreController;
use App\Http\Controllers\Api\KnowledgeTemplates\KnowledgeTemplateIndexController;
use App\Http\Controllers\Api\KnowledgeTemplates\KnowledgeTemplateShowController;
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
