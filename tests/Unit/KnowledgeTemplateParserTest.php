<?php

use App\Support\KnowledgeTemplates\TemplateParser;

function createDocxTemplate(array $entries): string
{
    $path = tempnam(sys_get_temp_dir(), 'docx-test-');
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

function createXlsxTemplate(array $entries): string
{
    return createDocxTemplate($entries);
}

test('parser extracts placeholders from docx including split runs and headers', function () {
    $contents = createDocxTemplate([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p>
              <w:r><w:t>客户：{{customer_name}}</w:t></w:r>
            </w:p>
            <w:p>
              <w:r><w:t>{{</w:t></w:r>
              <w:r><w:t>contract_code</w:t></w:r>
              <w:r><w:t>}}</w:t></w:r>
            </w:p>
          </w:body>
        </w:document>
        XML,
        'word/header1.xml' => <<<'XML'
        <w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:p>
            <w:r><w:t>收文时间：{{received_at}}</w:t></w:r>
          </w:p>
        </w:hdr>
        XML,
    ]);

    $parsed = (new TemplateParser)->parse($contents, 'briefing-template.docx');

    expect($parsed['template_type'])->toBe('docx')
        ->and(array_column($parsed['fields'], 'name'))->toBe([
            'customer_name',
            'contract_code',
            'received_at',
        ])
        ->and($parsed['fields'][1]['locations'][0]['part'])->toBe('word/document.xml')
        ->and($parsed['fields'][2]['locations'][0]['part'])->toBe('word/header1.xml');
});

test('parser extracts placeholders from xlsx shared strings and inline strings', function () {
    $contents = createXlsxTemplate([
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
          <si><t>来文机关：{{来文机关}}</t></si>
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
                  <r><t>{{收文时间}}</t></r>
                </is>
              </c>
            </row>
          </sheetData>
        </worksheet>
        XML,
    ]);

    $parsed = (new TemplateParser)->parse($contents, 'briefing-template.xlsx');

    expect($parsed['template_type'])->toBe('xlsx')
        ->and(array_column($parsed['fields'], 'name'))->toBe([
            '来文机关',
            '收文时间',
        ])
        ->and($parsed['fields'][0]['locations'][0]['sheet'])->toBe('模板一')
        ->and($parsed['fields'][1]['locations'][0]['cell'])->toBe('B2');
});

test('parser rejects templates without placeholders', function () {
    $contents = createDocxTemplate([
        'word/document.xml' => <<<'XML'
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>没有字段</w:t></w:r></w:p>
          </w:body>
        </w:document>
        XML,
    ]);

    expect(fn () => (new TemplateParser)->parse($contents, 'plain.docx'))
        ->toThrow('模板中未发现任何 {{field}} 占位符');
});
