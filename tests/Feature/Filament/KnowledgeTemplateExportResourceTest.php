<?php

use App\Filament\Resources\KnowledgeTemplateExports\KnowledgeTemplateExportResource;
use App\Filament\Resources\KnowledgeTemplateExports\Pages\ListKnowledgeTemplateExports;
use App\Models\KnowledgeTemplateExport;
use App\Models\User;
use App\Support\AdminRoles;
use Livewire\Livewire;

test('admin users can access the knowledge template export resource', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeTemplateExportResource::getUrl());

    $response->assertOk();
    $response->assertSee('模板导出记录');
});

test('knowledge template export list shows export owner and template information', function () {
    $admin = createAdminUser();
    $export = KnowledgeTemplateExport::factory()->create([
        'output_filename' => 'briefing-export.docx',
    ]);
    $export->load(['ownerUser', 'template']);

    $this->actingAs($admin);

    Livewire::test(ListKnowledgeTemplateExports::class)
        ->assertOk()
        ->assertCanSeeTableRecords([$export])
        ->assertSee($export->output_filename)
        ->assertSee($export->ownerUser->name)
        ->assertSee($export->template->name)
        ->assertTableActionVisible('downloadExport', $export->getKey());
});

test('read only admins can access the knowledge template export resource', function () {
    $admin = createAdminUser(AdminRoles::READ_ONLY_ADMINISTRATOR);

    $response = $this->actingAs($admin)->get(KnowledgeTemplateExportResource::getUrl());

    $response->assertOk();
});

test('non admin users cannot access the knowledge template export resource', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(KnowledgeTemplateExportResource::getUrl());

    $response->assertForbidden();
});
