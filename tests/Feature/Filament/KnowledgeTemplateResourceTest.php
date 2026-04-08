<?php

use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use App\Filament\Resources\KnowledgeTemplates\Pages\CreateKnowledgeTemplate;
use App\Filament\Resources\KnowledgeTemplates\Pages\EditKnowledgeTemplate;
use App\Filament\Resources\KnowledgeTemplates\Pages\ListKnowledgeTemplates;
use App\Filament\Resources\KnowledgeTemplates\RelationManagers\FieldsRelationManager;
use App\Jobs\ParseKnowledgeTemplate;
use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateField;
use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeUser;
use App\Models\User;
use App\Support\AdminRoles;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;

function createFilamentDocxTemplate(array $entries): string
{
    $path = tempnam(sys_get_temp_dir(), 'filament-docx-test-');
    $zip = new ZipArchive;
    $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);

    foreach ($entries as $name => $contents) {
        $zip->addFromString($name, $contents);
    }

    $zip->close();
    $contents = file_get_contents($path);
    @unlink($path);

    expect($contents)->toBeString();

    return $contents;
}

test('admin users can access the knowledge template resource', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeTemplateResource::getUrl());

    $response->assertOk();
});

test('knowledge template list empty state is rendered in simplified chinese', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeTemplateResource::getUrl());

    $response->assertOk();
    $response->assertSee('暂无模板');
    $response->assertSee('上传 docx 或 xlsx 模板后，这里会显示模板列表与解析状态。');
});

test('knowledge template create page is rendered in simplified chinese', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeTemplateResource::getUrl('create'));

    $response->assertOk();
    $response->assertSee('模板市场');
    $response->assertSee('基础信息');
    $response->assertSee('系统级提示词');
    $response->assertSee('模板文件');
    $response->assertSee('分配与资料');
    $response->assertSeeInOrder(['基础信息', '分配与资料', '模板文件']);
    $response->assertDontSee('模板类型将在上传后自动识别');
    $response->assertDontSee('待创建');
    $response->assertDontSee('尚未上传文件');
});

test('knowledge template form schema uses textarea for the system prompt', function () {
    $source = file_get_contents(app_path('Filament/Resources/KnowledgeTemplates/Schemas/KnowledgeTemplateForm.php'));

    expect($source)->toContain("Textarea::make('system_prompt')")
        ->and($source)->toContain('->columns(1)')
        ->and($source)->toContain("'xl' => 12")
        ->and($source)->toContain("'xl' => 5")
        ->and($source)->toContain("'xl' => 7")
        ->and($source)->toContain("'lg' => 4")
        ->and($source)->toContain("'lg' => 3")
        ->and($source)->toContain("'lg' => 1")
        ->and($source)->toContain('->columnSpanFull()')
        ->and($source)->not->toContain("MarkdownEditor::make('system_prompt')")
        ->and($source)->not->toContain('Flex::make([');
});

test('knowledge template edit page is rendered with the workspace layout', function () {
    $admin = createAdminUser();
    $template = KnowledgeTemplate::factory()->create([
        'parse_status' => KnowledgeTemplate::PARSE_STATUS_READY,
    ]);

    $response = $this->actingAs($admin)->get(KnowledgeTemplateResource::getUrl('edit', ['record' => $template]));

    $response->assertOk();
    $response->assertSee('基础信息');
    $response->assertSee('系统级提示词');
    $response->assertSee('模板文件');
    $response->assertSee('分配与资料');
    $response->assertSeeInOrder(['基础信息', '模板文件', '分配与资料']);
    $response->assertSee('template.docx');
    $response->assertSee('可用');
    $response->assertDontSee('解析错误将只在失败时显示');
});

test('admin users can create a knowledge template from filament', function () {
    Storage::fake('kb_templates');
    Queue::fake();
    config()->set('knowledge-templates.storage_disk', 'kb_templates');
    config()->set('knowledge-templates.ai.enabled', false);

    $admin = createAdminUser();
    $knowledgeUser = KnowledgeUser::factory()->create([
        'username' => 'template_user',
        'name' => 'Template User',
    ]);
    $library = KnowledgeTemplateLibrary::factory()->create([
        'name' => '政策资料库',
        'storage_prefix' => 'ops/manuals',
    ]);
    $file = UploadedFile::fake()->createWithContent(
        'briefing-template.docx',
        createFilamentDocxTemplate([
            'word/document.xml' => <<<'XML'
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p><w:r><w:t>客户：{{customer_name}}</w:t></w:r></w:p>
              </w:body>
            </w:document>
            XML,
        ]),
    );

    $this->actingAs($admin);

    Livewire::test(CreateKnowledgeTemplate::class)
        ->assertOk()
        ->fillForm([
            'name' => '拟办意见模板',
            'system_prompt' => "## 生成要求\n\n- 请根据模板字段生成结构化表单。",
            'is_active' => true,
            'assignedKnowledgeUsers' => [$knowledgeUser->getKey()],
            'referenceLibraries' => [$library->getKey()],
            'template_upload' => $file,
        ])
        ->call('create')
        ->assertHasNoFormErrors()
        ->assertRedirect();

    $template = KnowledgeTemplate::query()->with(['assignedKnowledgeUsers', 'referenceLibraries'])->sole();

    expect($template->name)->toBe('拟办意见模板')
        ->and($template->system_prompt)->toBe("## 生成要求\n\n- 请根据模板字段生成结构化表单。")
        ->and($template->template_type)->toBe(KnowledgeTemplate::TYPE_DOCX)
        ->and($template->parse_status)->toBe(KnowledgeTemplate::PARSE_STATUS_PENDING)
        ->and($template->assignedKnowledgeUsers->modelKeys())->toBe([$knowledgeUser->getKey()])
        ->and($template->referenceLibraries->modelKeys())->toBe([$library->getKey()])
        ->and(Storage::disk('kb_templates')->exists($template->source_path))->toBeTrue();

    Queue::assertPushed(ParseKnowledgeTemplate::class, fn (ParseKnowledgeTemplate $job): bool => $job->templateId === $template->getKey()
        && $job->expectedChecksum === $template->checksum_sha256);
});

test('admin users can update a knowledge template from filament', function () {
    $admin = createAdminUser();
    $existingKnowledgeUser = KnowledgeUser::factory()->create([
        'username' => 'existing_template_user',
        'name' => 'Existing Template User',
    ]);
    $replacementKnowledgeUser = KnowledgeUser::factory()->create([
        'username' => 'replacement_template_user',
        'name' => 'Replacement Template User',
    ]);
    $existingLibrary = KnowledgeTemplateLibrary::factory()->create([
        'name' => '旧资料库',
        'storage_prefix' => 'ops/old',
    ]);
    $replacementLibrary = KnowledgeTemplateLibrary::factory()->create([
        'name' => '新资料库',
        'storage_prefix' => 'ops/new',
    ]);
    $template = KnowledgeTemplate::factory()->create([
        'name' => '旧模板名称',
        'system_prompt' => '旧提示词',
        'parse_status' => KnowledgeTemplate::PARSE_STATUS_READY,
    ]);

    $template->assignedKnowledgeUsers()->sync([$existingKnowledgeUser->getKey()]);
    $template->referenceLibraries()->sync([$existingLibrary->getKey()]);

    $this->actingAs($admin);

    Livewire::test(EditKnowledgeTemplate::class, [
        'record' => $template->getRouteKey(),
    ])
        ->assertOk()
        ->fillForm([
            'name' => '更新后的拟办模板',
            'system_prompt' => "# 角色\n\n你是公文拟办助手。\n\n- 缺失字段时明确指出\n- 不要虚构内容",
            'is_active' => false,
            'assignedKnowledgeUsers' => [$replacementKnowledgeUser->getKey()],
            'referenceLibraries' => [$replacementLibrary->getKey()],
        ])
        ->call('save')
        ->assertHasNoFormErrors();

    $template->refresh();
    $template->load(['assignedKnowledgeUsers', 'referenceLibraries']);

    expect($template->name)->toBe('更新后的拟办模板')
        ->and($template->system_prompt)->toBe("# 角色\n\n你是公文拟办助手。\n\n- 缺失字段时明确指出\n- 不要虚构内容")
        ->and($template->is_active)->toBeFalse()
        ->and($template->assignedKnowledgeUsers->modelKeys())->toBe([$replacementKnowledgeUser->getKey()])
        ->and($template->referenceLibraries->modelKeys())->toBe([$replacementLibrary->getKey()]);
});

test('admins can download stored templates', function () {
    Storage::fake('kb_templates');
    $admin = createAdminUser();
    $contents = 'template-bytes';

    Storage::disk('kb_templates')->put('kb/templates/tests/example.docx', $contents);

    $template = KnowledgeTemplate::factory()->create([
        'source_disk' => 'kb_templates',
        'source_path' => 'kb/templates/tests/example.docx',
        'source_filename' => 'example.docx',
        'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);

    $response = $this->actingAs($admin)->get(route('admin.knowledge-templates.download', $template));

    $response->assertOk();
    $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

test('read only admins can download stored templates', function () {
    Storage::fake('kb_templates');
    $admin = createAdminUser(AdminRoles::READ_ONLY_ADMINISTRATOR);
    $contents = 'template-bytes';

    Storage::disk('kb_templates')->put('kb/templates/tests/readonly.docx', $contents);

    $template = KnowledgeTemplate::factory()->create([
        'source_disk' => 'kb_templates',
        'source_path' => 'kb/templates/tests/readonly.docx',
        'source_filename' => 'readonly.docx',
        'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);

    $response = $this->actingAs($admin)->get(route('admin.knowledge-templates.download', $template));

    $response->assertOk();
});

test('non admin users cannot download stored templates', function () {
    Storage::fake('kb_templates');
    $user = User::factory()->create();

    Storage::disk('kb_templates')->put('kb/templates/tests/private.docx', 'template-bytes');

    $template = KnowledgeTemplate::factory()->create([
        'source_disk' => 'kb_templates',
        'source_path' => 'kb/templates/tests/private.docx',
        'source_filename' => 'private.docx',
        'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);

    $response = $this->actingAs($user)->get(route('admin.knowledge-templates.download', $template));

    $response->assertForbidden();
});

test('read only admins cannot trigger knowledge template maintenance actions', function () {
    $admin = createAdminUser(AdminRoles::READ_ONLY_ADMINISTRATOR);
    $template = KnowledgeTemplate::factory()->create();

    $this->actingAs($admin);

    Livewire::test(ListKnowledgeTemplates::class)
        ->assertTableActionVisible('downloadTemplate', $template->getKey())
        ->assertTableActionHidden('reparseTemplate', $template->getKey())
        ->assertTableActionHidden('generateFieldDrafts', $template->getKey());
});

test('knowledge template field empty state is rendered in simplified chinese', function () {
    $admin = createAdminUser();
    $template = KnowledgeTemplate::factory()->create();

    $this->actingAs($admin);

    Livewire::test(FieldsRelationManager::class, [
        'ownerRecord' => $template,
        'pageClass' => EditKnowledgeTemplate::class,
    ])
        ->assertSee('暂无字段定义')
        ->assertSee('模板解析完成后，这里会显示提取出的占位符字段。');
});

test('knowledge template field edit modal is rendered in simplified chinese', function () {
    $admin = createAdminUser();
    $template = KnowledgeTemplate::factory()->create();
    $field = KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
    ]);

    $this->actingAs($admin);

    Livewire::test(FieldsRelationManager::class, [
        'ownerRecord' => $template,
        'pageClass' => EditKnowledgeTemplate::class,
    ])
        ->mountTableAction('edit', $field->getKey())
        ->assertMountedActionModalSee('编辑模板字段')
        ->assertMountedActionModalDontSee('knowledge template field');
});
