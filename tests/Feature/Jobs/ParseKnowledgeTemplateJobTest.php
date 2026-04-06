<?php

use App\Jobs\ParseKnowledgeTemplate;
use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateField;
use App\Support\KnowledgeTemplates\TemplateSyncService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

function createJobDocxTemplate(array $entries): string
{
    $path = tempnam(sys_get_temp_dir(), 'job-docx-test-');
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

test('parse knowledge template job syncs fields and preserves manual metadata', function () {
    Storage::fake('kb_templates');
    config()->set('knowledge-templates.storage_disk', 'kb_templates');
    config()->set('knowledge-templates.ai', [
        'enabled' => true,
        'base_url' => 'http://ai.test',
        'api_key' => 'test-key',
        'model' => 'gpt-5.4',
        'timeout' => 30,
        'fallback_env_path' => null,
    ]);

    Http::fake([
        'http://ai.test/chat/completions' => Http::response([
            'choices' => [[
                'message' => [
                    'content' => json_encode([
                        'fields' => [
                            [
                                'name' => 'customer_name',
                                'label' => '客户姓名（AI）',
                                'description' => 'AI 生成的客户姓名字段说明。',
                            ],
                            [
                                'name' => 'contract_code',
                                'label' => '合同编号',
                                'description' => '用于标识该模板中的合同编号。',
                            ],
                        ],
                    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                ],
            ]],
        ]),
    ]);

    $contents = createJobDocxTemplate([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>客户：{{customer_name}}</w:t></w:r></w:p>
            <w:p><w:r><w:t>编号：{{contract_code}}</w:t></w:r></w:p>
          </w:body>
        </w:document>
        XML,
    ]);
    $checksum = hash('sha256', $contents);
    $path = 'kb/templates/tests/template.docx';

    Storage::disk('kb_templates')->put($path, $contents);

    $template = KnowledgeTemplate::factory()->create([
        'source_disk' => 'kb_templates',
        'source_path' => $path,
        'source_filename' => 'template.docx',
        'template_type' => KnowledgeTemplate::TYPE_DOCX,
        'checksum_sha256' => $checksum,
        'parse_status' => KnowledgeTemplate::PARSE_STATUS_PENDING,
    ]);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'customer_name',
        'label' => '客户姓名（人工）',
        'description' => '人工确认说明',
        'meta_source' => KnowledgeTemplateField::META_SOURCE_MANUAL,
        'sort_order' => 9,
        'locations_json' => [],
    ]);

    KnowledgeTemplateField::factory()->create([
        'template_id' => $template->getKey(),
        'name' => 'obsolete_field',
        'label' => '旧字段',
        'description' => null,
        'meta_source' => KnowledgeTemplateField::META_SOURCE_DEFAULT,
        'sort_order' => 10,
        'locations_json' => [],
    ]);

    (new ParseKnowledgeTemplate($template->getKey(), $checksum))
        ->handle(app(TemplateSyncService::class));

    $template->refresh();
    $template->load('fields');

    expect($template->parse_status)->toBe(KnowledgeTemplate::PARSE_STATUS_READY)
        ->and($template->parse_error)->toBeNull()
        ->and($template->parsed_at)->not->toBeNull()
        ->and($template->fields->pluck('name')->all())->toBe([
            'customer_name',
            'contract_code',
        ]);

    $customerField = $template->fields->firstWhere('name', 'customer_name');
    $contractField = $template->fields->firstWhere('name', 'contract_code');

    expect($customerField)->not->toBeNull()
        ->and($customerField->label)->toBe('客户姓名（人工）')
        ->and($customerField->description)->toBe('人工确认说明')
        ->and($customerField->meta_source)->toBe(KnowledgeTemplateField::META_SOURCE_MANUAL);

    expect($contractField)->not->toBeNull()
        ->and($contractField->label)->toBe('合同编号')
        ->and($contractField->description)->toBe('用于标识该模板中的合同编号。')
        ->and($contractField->meta_source)->toBe(KnowledgeTemplateField::META_SOURCE_AI);
});

test('parse knowledge template job ignores stale checksum tasks', function () {
    Storage::fake('kb_templates');
    config()->set('knowledge-templates.storage_disk', 'kb_templates');
    config()->set('knowledge-templates.ai.enabled', false);

    $contents = createJobDocxTemplate([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>客户：{{customer_name}}</w:t></w:r></w:p>
          </w:body>
        </w:document>
        XML,
    ]);
    $path = 'kb/templates/tests/template.docx';

    Storage::disk('kb_templates')->put($path, $contents);

    $template = KnowledgeTemplate::factory()->create([
        'source_disk' => 'kb_templates',
        'source_path' => $path,
        'source_filename' => 'template.docx',
        'template_type' => KnowledgeTemplate::TYPE_DOCX,
        'checksum_sha256' => 'new-checksum',
        'parse_status' => KnowledgeTemplate::PARSE_STATUS_PENDING,
    ]);

    (new ParseKnowledgeTemplate($template->getKey(), 'old-checksum'))
        ->handle(app(TemplateSyncService::class));

    $template->refresh();

    expect($template->parse_status)->toBe(KnowledgeTemplate::PARSE_STATUS_PENDING)
        ->and($template->fields()->count())->toBe(0);
});

test('parse knowledge template job extracts unicode field names from xlsx templates', function () {
    Storage::fake('kb_templates');
    config()->set('knowledge-templates.storage_disk', 'kb_templates');
    config()->set('knowledge-templates.ai.enabled', false);

    $contents = createJobDocxTemplate([
        'xl/workbook.xml' => <<<'XML'
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets>
            <sheet name="收文单" sheetId="1" r:id="rId1" />
          </sheets>
        </workbook>
        XML,
        'xl/_rels/workbook.xml.rels' => <<<'XML'
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />
        </Relationships>
        XML,
        'xl/sharedStrings.xml' => <<<'XML'
        <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <si><t>{{来文机关}}</t></si>
          <si><t>{{文号}}</t></si>
        </sst>
        XML,
        'xl/worksheets/sheet1.xml' => <<<'XML'
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData>
            <row r="1">
              <c r="A1" t="s"><v>0</v></c>
              <c r="C1" t="s"><v>1</v></c>
            </row>
            <row r="2">
              <c r="A2" t="inlineStr">
                <is>
                  <t>{{收文时间}}</t>
                </is>
              </c>
            </row>
          </sheetData>
        </worksheet>
        XML,
    ]);
    $checksum = hash('sha256', $contents);
    $path = 'kb/templates/tests/template.xlsx';

    Storage::disk('kb_templates')->put($path, $contents);

    $template = KnowledgeTemplate::factory()->create([
        'source_disk' => 'kb_templates',
        'source_path' => $path,
        'source_filename' => 'template.xlsx',
        'template_type' => KnowledgeTemplate::TYPE_XLSX,
        'checksum_sha256' => $checksum,
        'parse_status' => KnowledgeTemplate::PARSE_STATUS_PENDING,
    ]);

    (new ParseKnowledgeTemplate($template->getKey(), $checksum))
        ->handle(app(TemplateSyncService::class));

    $template->refresh();
    $template->load('fields');

    expect($template->parse_status)->toBe(KnowledgeTemplate::PARSE_STATUS_READY)
        ->and($template->fields->pluck('name')->all())->toBe([
            '来文机关',
            '文号',
            '收文时间',
        ])
        ->and($template->fields->firstWhere('name', '来文机关')?->locations_json[0]['sheet'])->toBe('收文单')
        ->and($template->fields->firstWhere('name', '收文时间')?->locations_json[0]['cell'])->toBe('A2');
});
