<?php

use App\Models\KnowledgeTemplate;
use App\Support\KnowledgeTemplates\TemplateExportRenderer;

function createRendererTemplateArchive(array $entries): string
{
    $path = tempnam(sys_get_temp_dir(), 'renderer-template-test-');
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

function readRendererTemplateArchiveEntry(string $contents, string $entryName): string
{
    $path = tempnam(sys_get_temp_dir(), 'renderer-template-read-');
    file_put_contents($path, $contents);
    $zip = new ZipArchive;
    $zip->open($path);
    $entryContents = $zip->getFromName($entryName);
    $zip->close();
    @unlink($path);

    expect($entryContents)->toBeString();

    return $entryContents;
}

test('renderer replaces docx placeholders across split runs', function () {
    $contents = createRendererTemplateArchive([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p>
              <w:r><w:t>{{</w:t></w:r>
              <w:r><w:t>customer_name</w:t></w:r>
              <w:r><w:t>}}</w:t></w:r>
            </w:p>
            <w:p><w:r><w:t>编号：{{contract_code}}</w:t></w:r></w:p>
          </w:body>
        </w:document>
        XML,
    ]);
    $template = new KnowledgeTemplate([
        'template_type' => KnowledgeTemplate::TYPE_DOCX,
        'source_filename' => 'split-runs.docx',
    ]);

    $renderedContents = (new TemplateExportRenderer)->render($template, $contents, [
        'customer_name' => '研发&测试中心',
        'contract_code' => 'CN-42',
    ]);
    $documentXml = readRendererTemplateArchiveEntry($renderedContents, 'word/document.xml');
    $decodedDocumentXml = html_entity_decode($documentXml, ENT_QUOTES | ENT_XML1, 'UTF-8');

    expect($documentXml)->toContain('&amp;')
        ->and($decodedDocumentXml)->toContain('研发&测试中心')
        ->and($decodedDocumentXml)->toContain('CN-42')
        ->and($documentXml)->not->toContain('{{')
        ->and($documentXml)->not->toContain('customer_name');
});

test('renderer replaces xlsx shared strings and inline strings', function () {
    $contents = createRendererTemplateArchive([
        'xl/workbook.xml' => <<<'XML'
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets>
            <sheet name="模板一" sheetId="1" r:id="rId1" />
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
          <si><t>{{company_name}}</t></si>
        </sst>
        XML,
        'xl/worksheets/sheet1.xml' => <<<'XML'
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
          <sheetData>
            <row r="1">
              <c r="A1" t="s"><v>0</v></c>
            </row>
            <row r="2">
              <c r="B2" t="inlineStr">
                <is>
                  <r><t>{{contract_code}}</t></r>
                </is>
              </c>
            </row>
            <row r="3">
              <c r="C3" t="str"><v>{{note}}</v></c>
            </row>
          </sheetData>
        </worksheet>
        XML,
    ]);
    $template = new KnowledgeTemplate([
        'template_type' => KnowledgeTemplate::TYPE_XLSX,
        'source_filename' => 'worksheet.xlsx',
    ]);

    $renderedContents = (new TemplateExportRenderer)->render($template, $contents, [
        'company_name' => '星河科技',
        'contract_code' => 'CN-42',
        'note' => '备注&审批',
    ]);
    $sharedStringsXml = readRendererTemplateArchiveEntry($renderedContents, 'xl/sharedStrings.xml');
    $worksheetXml = readRendererTemplateArchiveEntry($renderedContents, 'xl/worksheets/sheet1.xml');
    $decodedSharedStringsXml = html_entity_decode($sharedStringsXml, ENT_QUOTES | ENT_XML1, 'UTF-8');
    $decodedWorksheetXml = html_entity_decode($worksheetXml, ENT_QUOTES | ENT_XML1, 'UTF-8');

    expect($decodedSharedStringsXml)->toContain('星河科技')
        ->and($decodedWorksheetXml)->toContain('CN-42')
        ->and($worksheetXml)->toContain('&amp;')
        ->and($decodedWorksheetXml)->toContain('备注&审批')
        ->and($sharedStringsXml)->not->toContain('{{company_name}}')
        ->and($worksheetXml)->not->toContain('{{contract_code}}')
        ->and($worksheetXml)->not->toContain('{{note}}');
});

test('renderer fails fast when a placeholder value is missing', function () {
    $contents = createRendererTemplateArchive([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>{{customer_name}}</w:t></w:r></w:p>
          </w:body>
        </w:document>
        XML,
    ]);
    $template = new KnowledgeTemplate([
        'template_type' => KnowledgeTemplate::TYPE_DOCX,
        'source_filename' => 'missing-parameter.docx',
    ]);

    expect(fn () => (new TemplateExportRenderer)->render($template, $contents, []))
        ->toThrow(RuntimeException::class, '缺少模板参数 [customer_name]。');
});
