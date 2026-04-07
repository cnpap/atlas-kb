<?php

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateExport;
use App\Models\KnowledgeTemplateExportTask;
use App\Models\KnowledgeTemplateField;
use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeTemplateLibraryFile;
use App\Models\KnowledgeUser;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

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
        'name' => 'customer_name',
        'label' => '客户名称',
        'description' => '签约主体名称',
        'sort_order' => 1,
        'locations_json' => [['sheet' => '模板一', 'cell' => 'A1']],
    ]);

    $library = KnowledgeTemplateLibrary::factory()->create([
        'name' => '规章制度库',
        'storage_prefix' => 'ops/rules',
    ]);
    $template->referenceLibraries()->attach($library->getKey());

    KnowledgeTemplateLibraryFile::factory()->create([
        'library_id' => $library->getKey(),
    ]);

    $response = $this
        ->withHeaders(atlasKbInternalHeaders())
        ->getJson("/api/internal/knowledge-templates/{$template->getKey()}?user_id={$knowledgeUser->getKey()}");

    $response->assertSuccessful()
        ->assertJsonPath('data.id', $template->getKey())
        ->assertJsonPath('data.systemPrompt', '请提取字段后生成结构化内容。')
        ->assertJsonPath('data.fields.0.name', 'customer_name')
        ->assertJsonPath('data.fields.0.sortOrder', 1)
        ->assertJsonPath('data.referenceLibraries.0.name', '规章制度库')
        ->assertJsonPath('data.referenceLibraries.0.storagePrefix', 'ops/rules')
        ->assertJsonPath('data.referenceLibraries.0.fileCount', 1)
        ->assertJsonMissingPath('data.system_prompt')
        ->assertJsonMissingPath('data.reference_libraries');
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
        'title' => '资料一',
        'summary' => '资料摘要',
        'excerpt' => '资料摘要',
        'content_preview' => '资料摘要',
        'content' => '资料正文',
        'tags_json' => json_encode([]),
        'source_type' => 'text',
        'status' => 'ready',
        'source_filename' => 'source-1.txt',
        'source_url' => null,
        'mime_type' => 'text/plain',
        'byte_size' => 16,
        'latest_version' => 1,
        'ready_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
        'last_processed_at' => CarbonImmutable::create(2026, 4, 7, 15, 10, 0, 'UTC'),
        'snapshot_updated_at' => null,
        'failure_message' => null,
        'original_path' => 'source-1.txt',
        'index_path' => 'source-1.txt',
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
        'source_title' => '资料一',
        'task_type' => 'briefing',
        'template_id' => $template->getKey(),
        'template_name' => $template->name,
        'status' => KnowledgeTemplateExportTask::STATUS_COMPLETED,
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
        ->assertJsonPath('data.0.templateName', '拟办模板')
        ->assertJsonPath('data.0.createdAt', '2026-04-07T15:11:00.000Z')
        ->assertJsonPath('data.0.completedAt', '2026-04-07T15:13:00.000Z')
        ->assertJsonPath('data.0.exportFile.id', $export->getKey())
        ->assertJsonPath('data.0.exportFile.createdAt', '2026-04-07T15:12:00.000Z')
        ->assertJsonMissingPath('data.0.owner_user_id')
        ->assertJsonMissingPath('data.0.export');
});
