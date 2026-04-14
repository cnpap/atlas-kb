<?php

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateExport;
use App\Models\KnowledgeTemplateExportTask;
use App\Models\KnowledgeTemplateField;
use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeTemplateLibraryFile;
use App\Models\KnowledgeUser;
use App\Support\AtlasKb\AtlasKbAgentClient;
use App\Support\KnowledgeTemplates\TemplateExportService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

function atlasKbInternalHeaders(): array
{
    config()->set('atlas-kb.internal_secret', 'atlas-kb-test-secret');

    return [
        'X-Atlas-Kb-Internal-Secret' => 'atlas-kb-test-secret',
    ];
}

function createReadyInternalTemplate(array $attributes = []): KnowledgeTemplate
{
    return KnowledgeTemplate::factory()->create([
        'parse_status' => KnowledgeTemplate::PARSE_STATUS_READY,
        'parsed_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 24, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 24, 'UTC'),
        'is_active' => true,
        ...$attributes,
    ]);
}

function assignInternalTemplate(KnowledgeTemplate $template, KnowledgeUser $user): void
{
    $user->assignedKnowledgeTemplates()->attach($template->getKey());
}

test('internal template list returns atlas-kb contract with utc z timestamps', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();
    $template = createReadyInternalTemplate([
        'name' => '拟办意见',
        'template_type' => KnowledgeTemplate::TYPE_XLSX,
        'source_filename' => '文件阅办单.xlsx',
    ]);
    assignInternalTemplate($template, $knowledgeUser);

    KnowledgeTemplateField::factory()->count(5)->create([
        'template_id' => $template->getKey(),
    ]);

    $response = $this
        ->withHeaders(atlasKbInternalHeaders())
        ->getJson("/api/internal/knowledge-templates?user_id={$knowledgeUser->getKey()}");

    $response->assertSuccessful()
        ->assertJsonPath('data.0.id', $template->getKey())
        ->assertJsonPath('data.0.name', '拟办意见')
        ->assertJsonPath('data.0.templateType', 'xlsx')
        ->assertJsonPath('data.0.sourceFilename', '文件阅办单.xlsx')
        ->assertJsonPath('data.0.fieldCount', 5)
        ->assertJsonPath('data.0.referenceLibraryCount', 0)
        ->assertJsonPath('data.0.parsedAt', '2026-04-07T15:10:24.000Z')
        ->assertJsonPath('data.0.updatedAt', '2026-04-07T15:10:24.000Z')
        ->assertJsonMissingPath('data.0.template_type')
        ->assertJsonMissingPath('data.0.field_count');
});

test('internal template detail returns atlas-kb contract with camel case fields', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();
    $template = createReadyInternalTemplate([
        'name' => '拟办模板',
        'system_prompt' => '请提取字段后生成结构化内容。',
    ]);
    assignInternalTemplate($template, $knowledgeUser);

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
        'source_path' => 'ops/rules/2026/04/guide.pdf',
        'source_filename' => 'guide.pdf',
        'mime_type' => 'application/pdf',
        'byte_size' => 4096,
    ]);

    $response = $this
        ->withHeaders(atlasKbInternalHeaders())
        ->getJson("/api/internal/knowledge-templates/{$template->getKey()}?user_id={$knowledgeUser->getKey()}");

    $response->assertSuccessful()
        ->assertJsonPath('data.id', $template->getKey())
        ->assertJsonPath('data.systemPrompt', '请提取字段后生成结构化内容。')
        ->assertJsonPath('data.fields.0.name', 'value_1')
        ->assertJsonPath('data.fields.0.sortOrder', 1)
        ->assertJsonPath('data.referenceLibraries.0.name', '规章制度库')
        ->assertJsonPath('data.referenceLibraries.0.storagePrefix', 'ops/rules')
        ->assertJsonPath('data.referenceLibraries.0.fileCount', 1)
        ->assertJsonPath('data.referenceLibraries.0.files.0.sourcePath', 'ops/rules/2026/04/guide.pdf')
        ->assertJsonPath('data.referenceLibraries.0.files.0.sourceFilename', 'guide.pdf')
        ->assertJsonMissingPath('data.system_prompt')
        ->assertJsonMissingPath('data.reference_libraries')
        ->assertJsonMissingPath('data.fields.0.locations');
});

test('atlas kb agent client sends current reference library file list', function () {
    config()->set('atlas-kb.api_base_url', 'http://atlas-kb.test');
    config()->set('atlas-kb.internal_secret', 'atlas-kb-test-secret');

    $knowledgeUser = KnowledgeUser::factory()->create();
    $template = createReadyInternalTemplate([
        'name' => '拟办模板',
        'system_prompt' => '请结合资料内容和参考资料库生成拟办意见。',
    ]);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'opinion',
        'placeholder_name' => 'opinion',
        'label' => '拟办意见',
        'description' => '给出拟办建议',
        'sort_order' => 1,
    ]);

    $library = KnowledgeTemplateLibrary::factory()->create([
        'name' => '规章制度库',
        'storage_prefix' => 'ops/rules',
    ]);
    $template->referenceLibraries()->attach($library->getKey());

    KnowledgeTemplateLibraryFile::factory()->create([
        'library_id' => $library->getKey(),
        'source_path' => 'ops/rules/2026/04/guide.pdf',
        'source_filename' => 'guide.pdf',
        'mime_type' => 'application/pdf',
        'byte_size' => 4096,
    ]);

    DB::table('kb_collections')->insert([
        'id' => 'agent-client-collection',
        'owner_user_id' => $knowledgeUser->getKey(),
        'name' => '资料库',
        'description' => '资料库描述',
        'color' => '#0f766e',
        'icon' => 'i-lucide-library',
        'is_pinned' => false,
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
        'last_activity_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
    ]);

    DB::table('kb_sources')->insert([
        'id' => 'source-1',
        'owner_user_id' => $knowledgeUser->getKey(),
        'collection_id' => 'agent-client-collection',
        'document_id' => 'source-1.pdf',
        'content' => '资料正文',
        'source_type' => 'file',
        'status' => 'ready',
        'source_filename' => 'source-1.pdf',
        'mime_type' => 'application/pdf',
        'byte_size' => 16,
        'failure_message' => null,
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
    ]);

    $task = KnowledgeTemplateExportTask::query()->create([
        'owner_user_id' => $knowledgeUser->getKey(),
        'source_id' => 'source-1',
        'source_filename' => 'source-1.pdf',
        'task_type' => 'template',
        'template_id' => $template->getKey(),
        'template_name' => $template->name,
        'status' => KnowledgeTemplateExportTask::STATUS_PENDING,
    ]);

    $template->load(['fields', 'referenceLibraries.files']);

    Http::fake([
        'http://atlas-kb.test/api/kb/internal/template-export-tasks/generate' => Http::response([
            'data' => [
                'result' => [
                    'parameters' => [
                        'opinion' => '建议按制度办理。',
                    ],
                    'citations' => [],
                ],
            ],
        ]),
    ]);

    app(AtlasKbAgentClient::class)->generateExportPayload(
        $task,
        $template,
        $knowledgeUser,
    );

    Http::assertSent(function (Request $request): bool {
        $data = $request->data();
        $files = data_get($data, 'template.referenceLibraries.0.files');

        return $request->url() === 'http://atlas-kb.test/api/kb/internal/template-export-tasks/generate'
            && data_get($data, 'template.referenceLibraries.0.storagePrefix') === 'ops/rules'
            && is_array($files)
            && count($files) === 1
            && $files[0]['sourcePath'] === 'ops/rules/2026/04/guide.pdf'
            && $files[0]['sourceFilename'] === 'guide.pdf'
            && $files[0]['mimeType'] === 'application/pdf'
            && $files[0]['byteSize'] === 4096;
    });
});

test('internal export task list returns atlas-kb contract with utc z timestamps', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();
    $template = createReadyInternalTemplate([
        'name' => '拟办模板',
    ]);
    assignInternalTemplate($template, $knowledgeUser);

    DB::table('kb_collections')->insert([
        'id' => 'collection-1',
        'owner_user_id' => $knowledgeUser->getKey(),
        'name' => '资料库',
        'description' => '资料库描述',
        'color' => '#0f766e',
        'icon' => 'i-lucide-library',
        'is_pinned' => false,
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
        'last_activity_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
    ]);

    DB::table('kb_sources')->insert([
        'id' => 'source-1',
        'owner_user_id' => $knowledgeUser->getKey(),
        'collection_id' => 'collection-1',
        'document_id' => 'source-1.txt',
        'content' => '资料正文',
        'source_type' => 'text',
        'status' => 'ready',
        'source_filename' => 'source-1.txt',
        'mime_type' => 'text/plain',
        'byte_size' => 16,
        'failure_message' => null,
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
    ]);

    $export = KnowledgeTemplateExport::factory()->create([
        'template_id' => $template->getKey(),
        'owner_user_id' => $knowledgeUser->getKey(),
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 12, 0, 'UTC'),
        'expires_at' => CarbonImmutable::create(2026, 5, 7, 0, 0, 0, 'UTC'),
    ]);

    $task = KnowledgeTemplateExportTask::query()->create([
        'owner_user_id' => $knowledgeUser->getKey(),
        'source_id' => 'source-1',
        'source_filename' => 'source-1.txt',
        'task_type' => 'template',
        'template_id' => $template->getKey(),
        'template_name' => $template->name,
        'status' => KnowledgeTemplateExportTask::STATUS_COMPLETED,
        'parameters_json' => [
            'customer_name' => '测试公司',
        ],
        'export_id' => $export->getKey(),
        'completed_at' => CarbonImmutable::create(2026, 4, 7, 15, 13, 0, 'UTC'),
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 11, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 13, 0, 'UTC'),
    ]);

    $response = $this
        ->withHeaders(atlasKbInternalHeaders())
        ->getJson("/api/internal/knowledge-template-export-tasks?user_id={$knowledgeUser->getKey()}&source_id=source-1");

    $response->assertSuccessful()
        ->assertJsonPath('data.0.id', $task->getKey())
        ->assertJsonPath('data.0.ownerUserId', (string) $knowledgeUser->getKey())
        ->assertJsonPath('data.0.sourceId', 'source-1')
        ->assertJsonPath('data.0.sourceFilename', 'source-1.txt')
        ->assertJsonPath('data.0.templateName', '拟办模板')
        ->assertJsonPath('data.0.createdAt', '2026-04-07T15:11:00.000Z')
        ->assertJsonPath('data.0.completedAt', '2026-04-07T15:13:00.000Z')
        ->assertJsonPath('data.0.exportFile.id', $export->getKey())
        ->assertJsonPath('data.0.exportFile.createdAt', '2026-04-07T15:12:00.000Z')
        ->assertJsonMissingPath('data.0.owner_user_id')
        ->assertJsonMissingPath('data.0.export');
});

test('internal export task detail returns template fields and parameters', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();
    $template = createReadyInternalTemplate([
        'name' => '拟办模板',
    ]);
    assignInternalTemplate($template, $knowledgeUser);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'document_title',
        'placeholder_name' => 'document_title',
        'label' => '文件标题',
        'sort_order' => 1,
    ]);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'opinion',
        'placeholder_name' => 'opinion',
        'label' => '拟办意见',
        'sort_order' => 2,
    ]);

    DB::table('kb_collections')->insert([
        'id' => 'collection-show',
        'owner_user_id' => $knowledgeUser->getKey(),
        'name' => '资料库',
        'description' => '资料库描述',
        'color' => '#0f766e',
        'icon' => 'i-lucide-library',
        'is_pinned' => false,
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
        'last_activity_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
    ]);

    DB::table('kb_sources')->insert([
        'id' => 'source-show',
        'owner_user_id' => $knowledgeUser->getKey(),
        'collection_id' => 'collection-show',
        'document_id' => 'source-show.txt',
        'content' => '资料正文',
        'source_type' => 'text',
        'status' => 'ready',
        'source_filename' => 'source-show.txt',
        'mime_type' => 'text/plain',
        'byte_size' => 16,
        'failure_message' => null,
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
    ]);

    $task = KnowledgeTemplateExportTask::query()->create([
        'owner_user_id' => $knowledgeUser->getKey(),
        'source_id' => 'source-show',
        'source_filename' => 'source-show.txt',
        'task_type' => 'template',
        'template_id' => $template->getKey(),
        'template_name' => $template->name,
        'parameters_json' => [
            'document_title' => '关于预算调整的请示',
            'opinion' => '请办公室提出办理意见。',
        ],
        'status' => KnowledgeTemplateExportTask::STATUS_COMPLETED,
        'completed_at' => CarbonImmutable::create(2026, 4, 7, 15, 13, 0, 'UTC'),
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 11, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 13, 0, 'UTC'),
    ]);

    $response = $this
        ->withHeaders(atlasKbInternalHeaders())
        ->getJson("/api/internal/knowledge-template-export-tasks/{$task->getKey()}?user_id={$knowledgeUser->getKey()}");

    $response->assertSuccessful()
        ->assertJsonPath('data.id', $task->getKey())
        ->assertJsonPath('data.sourceFilename', 'source-show.txt')
        ->assertJsonPath('data.template.id', $template->getKey())
        ->assertJsonPath('data.template.fields.0.name', 'document_title')
        ->assertJsonPath('data.parameters.document_title', '关于预算调整的请示')
        ->assertJsonPath('data.parameters.opinion', '请办公室提出办理意见。')
        ->assertJsonPath('data.canEdit', true);
});

test('internal export task update rewrites parameters and returns refreshed export file', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();
    $template = createReadyInternalTemplate([
        'name' => '拟办模板',
        'template_type' => KnowledgeTemplate::TYPE_XLSX,
        'source_disk' => 'unused',
        'source_path' => 'unused/template.xlsx',
        'source_filename' => 'template.xlsx',
        'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
    assignInternalTemplate($template, $knowledgeUser);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'document_title',
        'placeholder_name' => 'document_title',
        'label' => '文件标题',
        'sort_order' => 1,
    ]);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'opinion',
        'placeholder_name' => 'opinion',
        'label' => '拟办意见',
        'sort_order' => 2,
    ]);

    DB::table('kb_collections')->insert([
        'id' => 'collection-update',
        'owner_user_id' => $knowledgeUser->getKey(),
        'name' => '资料库',
        'description' => '资料库描述',
        'color' => '#0f766e',
        'icon' => 'i-lucide-library',
        'is_pinned' => false,
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
        'last_activity_at' => CarbonImmutable::create(2026, 4, 7, 15, 9, 0, 'UTC'),
    ]);

    DB::table('kb_sources')->insert([
        'id' => 'source-update',
        'owner_user_id' => $knowledgeUser->getKey(),
        'collection_id' => 'collection-update',
        'document_id' => 'source-update.txt',
        'content' => '资料正文',
        'source_type' => 'text',
        'status' => 'ready',
        'source_filename' => 'source-update.txt',
        'mime_type' => 'text/plain',
        'byte_size' => 16,
        'failure_message' => null,
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
    ]);

    $task = KnowledgeTemplateExportTask::query()->create([
        'owner_user_id' => $knowledgeUser->getKey(),
        'source_id' => 'source-update',
        'source_filename' => 'source-update.txt',
        'task_type' => 'template',
        'template_id' => $template->getKey(),
        'template_name' => $template->name,
        'parameters_json' => [
            'document_title' => '旧标题',
            'opinion' => '旧拟办意见',
        ],
        'status' => KnowledgeTemplateExportTask::STATUS_COMPLETED,
        'completed_at' => CarbonImmutable::create(2026, 4, 7, 15, 13, 0, 'UTC'),
        'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 11, 0, 'UTC'),
        'updated_at' => CarbonImmutable::create(2026, 4, 7, 15, 13, 0, 'UTC'),
    ]);

    app()->instance(TemplateExportService::class, new class extends TemplateExportService
    {
        public function __construct() {}

        public function create(
            KnowledgeTemplate $template,
            KnowledgeUser $ownerUser,
            array $parameters,
        ): KnowledgeTemplateExport {
            return KnowledgeTemplateExport::query()->create([
                'id' => 'export-updated-task',
                'template_id' => $template->getKey(),
                'owner_user_id' => $ownerUser->getKey(),
                'output_disk' => 'kb_templates',
                'output_path' => 'kb/template-exports/export-updated-task.xlsx',
                'output_filename' => '拟办模板-更新版.xlsx',
                'mime_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'byte_size' => 256,
                'expires_at' => CarbonImmutable::create(2026, 5, 7, 0, 0, 0, 'UTC'),
                'created_at' => CarbonImmutable::create(2026, 4, 7, 15, 18, 0, 'UTC'),
            ]);
        }
    });

    $response = $this
        ->withHeaders(atlasKbInternalHeaders())
        ->patchJson("/api/internal/knowledge-template-export-tasks/{$task->getKey()}", [
            'user_id' => $knowledgeUser->getKey(),
            'parameters' => [
                'document_title' => '新标题',
                'opinion' => '新拟办意见',
            ],
        ]);

    $response->assertSuccessful()
        ->assertJsonPath('data.sourceFilename', 'source-update.txt')
        ->assertJsonPath('data.parameters.document_title', '新标题')
        ->assertJsonPath('data.parameters.opinion', '新拟办意见')
        ->assertJsonPath('data.exportFile.templateId', $template->getKey())
        ->assertJsonPath('data.exportFile.outputFilename', '拟办模板-更新版.xlsx');

    $task->refresh();
    expect($task->parameters_json)->toBe([
        'document_title' => '新标题',
        'opinion' => '新拟办意见',
    ]);
    expect($task->export_id)->not->toBeNull();
});
