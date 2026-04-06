<?php

use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use App\Filament\Resources\KnowledgeTemplates\Pages\CreateKnowledgeTemplate;
use App\Filament\Resources\KnowledgeTemplates\Pages\EditKnowledgeTemplate;
use App\Filament\Resources\KnowledgeTemplates\Pages\ListKnowledgeTemplates;
use App\Filament\Resources\KnowledgeTemplates\RelationManagers\FieldsRelationManager;
use App\Jobs\ParseKnowledgeTemplate;
use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateField;
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
    $response->assertSee('模板名称');
    $response->assertSee('系统级提示词');
    $response->assertSee('模板文件');
});

test('admin users can create a knowledge template from filament', function () {
    Storage::fake('kb_templates');
    Queue::fake();
    config()->set('knowledge-templates.storage_disk', 'kb_templates');
    config()->set('knowledge-templates.ai.enabled', false);

    $admin = createAdminUser();
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
            'system_prompt' => '请根据模板字段生成结构化表单。',
            'is_active' => true,
            'template_upload' => $file,
        ])
        ->call('create')
        ->assertHasNoFormErrors()
        ->assertRedirect();

    $template = KnowledgeTemplate::query()->sole();

    expect($template->name)->toBe('拟办意见模板')
        ->and($template->template_type)->toBe(KnowledgeTemplate::TYPE_DOCX)
        ->and($template->parse_status)->toBe(KnowledgeTemplate::PARSE_STATUS_PENDING)
        ->and(Storage::disk('kb_templates')->exists($template->source_path))->toBeTrue();

    Queue::assertPushed(ParseKnowledgeTemplate::class, fn (ParseKnowledgeTemplate $job): bool => $job->templateId === $template->getKey()
        && $job->expectedChecksum === $template->checksum_sha256);
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
