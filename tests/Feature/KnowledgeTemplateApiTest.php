<?php

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateExport;
use App\Models\KnowledgeTemplateField;
use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeTemplateLibraryFile;
use App\Models\KnowledgeUser;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function createApiTemplateArchive(array $entries): string
{
    $path = tempnam(sys_get_temp_dir(), 'api-template-test-');
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

function readApiArchiveEntry(string $contents, string $entryName): string
{
    $path = tempnam(sys_get_temp_dir(), 'api-template-read-');
    file_put_contents($path, $contents);
    $zip = new ZipArchive;
    $zip->open($path);
    $entryContents = $zip->getFromName($entryName);
    $zip->close();
    @unlink($path);

    expect($entryContents)->toBeString();

    return $entryContents;
}

function createReadyApiTemplate(array $attributes = []): KnowledgeTemplate
{
    return KnowledgeTemplate::factory()->create([
        'parse_status' => KnowledgeTemplate::PARSE_STATUS_READY,
        'parsed_at' => now(),
        'is_active' => true,
        ...$attributes,
    ]);
}

function configureTemplateApiStorageDisk(string $url = 'https://s3dev.apitype.com/ops-agent-kit'): void
{
    $root = storage_path('framework/testing/disks/'.Str::uuid());

    config()->set('filesystems.disks.kb_templates', [
        'driver' => 'local',
        'root' => $root,
        'url' => $url,
        'visibility' => 'public',
        'throw' => false,
        'report' => false,
    ]);
}

function assignTemplateToKnowledgeUser(KnowledgeTemplate $template, KnowledgeUser $knowledgeUser): void
{
    $knowledgeUser->assignedKnowledgeTemplates()->attach($template->getKey());
}

test('user scoped template list returns only assigned ready active templates without pagination metadata', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();

    $availableTemplate = createReadyApiTemplate([
        'name' => '公文模板',
        'updated_at' => now()->subMinute(),
    ]);
    assignTemplateToKnowledgeUser($availableTemplate, $knowledgeUser);

    KnowledgeTemplateField::factory()->count(2)->create([
        'template_id' => $availableTemplate->getKey(),
    ]);

    createReadyApiTemplate([
        'name' => '停用模板',
        'is_active' => false,
    ])->assignedKnowledgeUsers()->attach($knowledgeUser->getKey());

    KnowledgeTemplate::factory()->create([
        'name' => '待解析模板',
        'parse_status' => KnowledgeTemplate::PARSE_STATUS_PENDING,
        'parsed_at' => null,
    ])->assignedKnowledgeUsers()->attach($knowledgeUser->getKey());

    createReadyApiTemplate([
        'name' => '未分配模板',
    ]);

    $response = $this->getJson("/api/users/{$knowledgeUser->getKey()}/knowledge-templates");

    $response->assertSuccessful()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $availableTemplate->getKey())
        ->assertJsonPath('data.0.name', '公文模板')
        ->assertJsonPath('data.0.field_count', 2)
        ->assertJsonMissingPath('data.0.system_prompt')
        ->assertJsonMissingPath('meta');
});

test('user scoped template detail returns fields system prompt and reference libraries', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();
    $template = createReadyApiTemplate([
        'name' => '拟办模板',
        'system_prompt' => '请提取字段后生成结构化内容。',
    ]);
    assignTemplateToKnowledgeUser($template, $knowledgeUser);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'value_2',
        'placeholder_name' => 'contract_code',
        'label' => '合同编号',
        'description' => '合同主键编号',
        'sort_order' => 2,
    ]);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'value_1',
        'placeholder_name' => 'customer_name',
        'label' => '客户名称',
        'description' => '签约主体名称',
        'sort_order' => 1,
    ]);

    $library = KnowledgeTemplateLibrary::factory()->create([
        'name' => '规章制度库',
        'storage_prefix' => 'ops/rules',
    ]);
    $template->referenceLibraries()->attach($library->getKey());

    KnowledgeTemplateLibraryFile::factory()->create([
        'library_id' => $library->getKey(),
    ]);

    $response = $this->getJson("/api/users/{$knowledgeUser->getKey()}/knowledge-templates/{$template->getKey()}");

    $response->assertSuccessful()
        ->assertJsonPath('data.id', $template->getKey())
        ->assertJsonPath('data.system_prompt', '请提取字段后生成结构化内容。')
        ->assertJsonPath('data.fields.0.name', 'value_1')
        ->assertJsonPath('data.fields.1.name', 'value_2')
        ->assertJsonPath('data.reference_libraries.0.name', '规章制度库')
        ->assertJsonPath('data.reference_libraries.0.storage_prefix', 'ops/rules')
        ->assertJsonPath('data.reference_libraries.0.file_count', 1)
        ->assertJsonMissingPath('data.fields.0.locations');
});

test('template detail returns not found for unassigned templates', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();
    $template = createReadyApiTemplate();

    $this->getJson("/api/users/{$knowledgeUser->getKey()}/knowledge-templates/{$template->getKey()}")
        ->assertNotFound();
});

test('user scoped export endpoint stores rendered files and returns owner user details', function () {
    configureTemplateApiStorageDisk();
    config()->set('knowledge-templates.storage_disk', 'kb_templates');
    config()->set('knowledge-templates.exports.disk', 'kb_templates');
    config()->set('knowledge-templates.exports.directory', 'kb/template-exports');
    config()->set('knowledge-templates.exports.retention_days', 30);

    $templateContents = createApiTemplateArchive([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p>
              <w:r><w:t>客户：</w:t></w:r>
              <w:r><w:t>{{customer_name}}</w:t></w:r>
            </w:p>
            <w:p><w:r><w:t>编号：{{contract_code}}</w:t></w:r></w:p>
          </w:body>
        </w:document>
        XML,
    ]);
    $templatePath = 'kb/templates/tests/export-template.docx';

    Storage::disk('kb_templates')->put($templatePath, $templateContents);

    $template = createReadyApiTemplate([
        'source_disk' => 'kb_templates',
        'source_path' => $templatePath,
        'source_filename' => 'export-template.docx',
        'template_type' => KnowledgeTemplate::TYPE_DOCX,
        'checksum_sha256' => hash('sha256', $templateContents),
    ]);
    $knowledgeUser = KnowledgeUser::factory()->create([
        'name' => '张三',
        'username' => 'zhangsan',
    ]);
    assignTemplateToKnowledgeUser($template, $knowledgeUser);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'value_1',
        'placeholder_name' => 'customer_name',
        'label' => '客户名称',
        'sort_order' => 1,
    ]);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'value_2',
        'placeholder_name' => 'contract_code',
        'label' => '合同编号',
        'sort_order' => 2,
    ]);

    $response = $this->postJson("/api/users/{$knowledgeUser->getKey()}/knowledge-templates/{$template->getKey()}/exports", [
        'parameters' => [
            'value_1' => '研发&测试中心',
            'value_2' => 'CN-42',
        ],
    ]);

    $response->assertCreated()
        ->assertJsonPath('data.template_id', $template->getKey())
        ->assertJsonPath('data.owner_user.id', $knowledgeUser->getKey())
        ->assertJsonPath('data.owner_user.name', '张三')
        ->assertJsonPath('data.owner_user.username', 'zhangsan');

    $downloadUrl = $response->json('data.download_url');

    expect($downloadUrl)->toBeString()
        ->and($downloadUrl)->toStartWith('https://s3dev.apitype.com/ops-agent-kit/kb/template-exports/');

    $export = KnowledgeTemplateExport::query()->sole();
    $renderedContents = Storage::disk('kb_templates')->get($export->output_path);
    $documentXml = readApiArchiveEntry($renderedContents, 'word/document.xml');
    $decodedDocumentXml = html_entity_decode($documentXml, ENT_QUOTES | ENT_XML1, 'UTF-8');

    expect($export->owner_user_id)->toBe($knowledgeUser->getKey())
        ->and($export->template_id)->toBe($template->getKey())
        ->and(Storage::disk('kb_templates')->exists($export->output_path))->toBeTrue()
        ->and($documentXml)->toContain('&amp;')
        ->and($decodedDocumentXml)->toContain('研发&测试中心')
        ->and($decodedDocumentXml)->toContain('CN-42')
        ->and($documentXml)->not->toContain('{{customer_name}}')
        ->and($documentXml)->not->toContain('{{contract_code}}');
});

test('user scoped export endpoint validates required template parameters', function () {
    Storage::fake('kb_templates');
    config()->set('knowledge-templates.storage_disk', 'kb_templates');
    config()->set('knowledge-templates.exports.disk', 'kb_templates');

    $templateContents = createApiTemplateArchive([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>{{customer_name}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>{{contract_code}}</w:t></w:r></w:p>
          </w:body>
        </w:document>
        XML,
    ]);
    $templatePath = 'kb/templates/tests/validation-template.docx';

    Storage::disk('kb_templates')->put($templatePath, $templateContents);

    $template = createReadyApiTemplate([
        'source_disk' => 'kb_templates',
        'source_path' => $templatePath,
        'source_filename' => 'validation-template.docx',
        'checksum_sha256' => hash('sha256', $templateContents),
    ]);
    $knowledgeUser = KnowledgeUser::factory()->create();
    assignTemplateToKnowledgeUser($template, $knowledgeUser);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'value_1',
        'placeholder_name' => 'customer_name',
        'sort_order' => 1,
    ]);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'value_2',
        'placeholder_name' => 'contract_code',
        'sort_order' => 2,
    ]);

    $this->postJson("/api/users/{$knowledgeUser->getKey()}/knowledge-templates/{$template->getKey()}/exports", [
        'parameters' => [
            'value_1' => '测试用户',
        ],
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['parameters']);
});

test('user scoped export endpoint validates unexpected template parameters', function () {
    Storage::fake('kb_templates');
    config()->set('knowledge-templates.storage_disk', 'kb_templates');
    config()->set('knowledge-templates.exports.disk', 'kb_templates');

    $templateContents = createApiTemplateArchive([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>{{customer_name}}</w:t></w:r></w:p>
          </w:body>
        </w:document>
        XML,
    ]);
    $templatePath = 'kb/templates/tests/unexpected-field-template.docx';

    Storage::disk('kb_templates')->put($templatePath, $templateContents);

    $template = createReadyApiTemplate([
        'source_disk' => 'kb_templates',
        'source_path' => $templatePath,
        'source_filename' => 'unexpected-field-template.docx',
        'checksum_sha256' => hash('sha256', $templateContents),
    ]);
    $knowledgeUser = KnowledgeUser::factory()->create();
    assignTemplateToKnowledgeUser($template, $knowledgeUser);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'value_1',
        'placeholder_name' => 'customer_name',
        'sort_order' => 1,
    ]);

    $this->postJson("/api/users/{$knowledgeUser->getKey()}/knowledge-templates/{$template->getKey()}/exports", [
        'parameters' => [
            'value_1' => '测试用户',
            'unexpected_field' => 'ignored',
        ],
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['parameters']);
});

test('export records can be queried by user with pagination and owner name', function () {
    config()->set('filesystems.disks.kb_templates.url', 'https://s3dev.apitype.com/ops-agent-kit');

    $user = KnowledgeUser::factory()->create([
        'name' => '李四',
        'username' => 'lisi',
    ]);
    $otherUser = KnowledgeUser::factory()->create([
        'name' => '王五',
        'username' => 'wangwu',
    ]);

    $latestExport = KnowledgeTemplateExport::factory()->create([
        'owner_user_id' => $user->getKey(),
        'created_at' => now(),
    ]);

    KnowledgeTemplateExport::factory()->create([
        'owner_user_id' => $user->getKey(),
        'created_at' => now()->subMinute(),
    ]);

    KnowledgeTemplateExport::factory()->create([
        'owner_user_id' => $otherUser->getKey(),
        'created_at' => now()->addMinute(),
    ]);

    $response = $this->getJson("/api/users/{$user->getKey()}/knowledge-template-exports?per_page=1");

    $response->assertSuccessful()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $latestExport->getKey())
        ->assertJsonPath('data.0.owner_user.name', '李四')
        ->assertJsonPath('data.0.owner_user.username', 'lisi')
        ->assertJsonPath('meta.total', 2)
        ->assertJsonPath('meta.per_page', 1);
});
