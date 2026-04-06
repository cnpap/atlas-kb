<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplate;
use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use RuntimeException;
use ZipArchive;

class TemplateParser
{
    protected const string PLACEHOLDER_PATTERN = '/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/u';

    /**
     * @return array{
     *     template_type: string,
     *     fields: list<array{
     *         name: string,
     *         sort_order: int,
     *         locations: list<array<string, string>>
     *     }>
     * }
     */
    public function parse(string $contents, string $sourceFilename): array
    {
        $templateType = strtolower(pathinfo($sourceFilename, PATHINFO_EXTENSION));
        $temporaryPath = tempnam(sys_get_temp_dir(), 'kb-template-');

        if ($temporaryPath === false) {
            throw new RuntimeException('无法创建模板解析临时文件。');
        }

        file_put_contents($temporaryPath, $contents);

        try {
            $fields = match ($templateType) {
                KnowledgeTemplate::TYPE_DOCX => $this->parseDocx($temporaryPath),
                KnowledgeTemplate::TYPE_XLSX => $this->parseXlsx($temporaryPath),
                default => throw new RuntimeException('当前模板格式不受支持。'),
            };
        } finally {
            @unlink($temporaryPath);
        }

        if ($fields === []) {
            throw new RuntimeException('模板中未发现任何 {{field}} 占位符。');
        }

        return [
            'template_type' => $templateType,
            'fields' => array_values($fields),
        ];
    }

    /**
     * @return array<string, array{name: string, sort_order: int, locations: list<array<string, string>>}>
     */
    protected function parseDocx(string $temporaryPath): array
    {
        $zip = $this->openArchive($temporaryPath);
        $fields = [];
        $entries = [];

        for ($index = 0; $index < $zip->numFiles; $index += 1) {
            $entryName = $zip->getNameIndex($index);

            if (! is_string($entryName)) {
                continue;
            }

            if (! preg_match('#^word/(document|header\d+|footer\d+)\.xml$#', $entryName)) {
                continue;
            }

            $entries[] = $entryName;
        }

        sort($entries);

        foreach ($entries as $entryName) {
            $document = $this->loadXmlDocument($zip, $entryName);
            $xpath = new DOMXPath($document);
            $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
            $paragraphs = $xpath->query('//w:p');

            if ($paragraphs === false) {
                continue;
            }

            foreach ($paragraphs as $offset => $paragraph) {
                if (! $paragraph instanceof DOMElement) {
                    continue;
                }

                $text = $this->extractDocxParagraphText($paragraph);

                if ($text === '') {
                    continue;
                }

                $this->recordPlaceholderMatches($fields, $text, [
                    'kind' => 'docx',
                    'part' => $entryName,
                    'block' => '段落 '.($offset + 1),
                ]);
            }
        }

        $zip->close();

        return $fields;
    }

    /**
     * @return array<string, array{name: string, sort_order: int, locations: list<array<string, string>>}>
     */
    protected function parseXlsx(string $temporaryPath): array
    {
        $zip = $this->openArchive($temporaryPath);
        $fields = [];
        $sharedStrings = $this->readSharedStrings($zip);
        $sheetMap = $this->readWorkbookSheetMap($zip);

        foreach ($sheetMap as $sheetName => $entryName) {
            $document = $this->loadXmlDocument($zip, $entryName);
            $xpath = new DOMXPath($document);
            $xpath->registerNamespace('main', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $cells = $xpath->query('//main:c');

            if ($cells === false) {
                continue;
            }

            foreach ($cells as $cell) {
                if (! $cell instanceof DOMElement) {
                    continue;
                }

                $text = $this->extractWorksheetCellText($xpath, $cell, $sharedStrings);

                if ($text === '') {
                    continue;
                }

                $this->recordPlaceholderMatches($fields, $text, [
                    'kind' => 'xlsx',
                    'sheet' => $sheetName,
                    'cell' => (string) $cell->getAttribute('r'),
                ]);
            }
        }

        $zip->close();

        return $fields;
    }

    protected function openArchive(string $temporaryPath): ZipArchive
    {
        $zip = new ZipArchive;
        $opened = $zip->open($temporaryPath);

        if ($opened !== true) {
            throw new RuntimeException('模板文件不是有效的 Office Open XML 压缩包。');
        }

        return $zip;
    }

    protected function loadXmlDocument(ZipArchive $zip, string $entryName): DOMDocument
    {
        $contents = $zip->getFromName($entryName);

        if (! is_string($contents) || $contents === '') {
            throw new RuntimeException("无法读取模板内部文件 [{$entryName}]。");
        }

        $document = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $loaded = $document->loadXML($contents, LIBXML_NONET | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded) {
            throw new RuntimeException("模板内部文件 [{$entryName}] 不是有效的 XML。");
        }

        return $document;
    }

    protected function extractDocxParagraphText(DOMElement $paragraph): string
    {
        $parts = [];

        foreach ($paragraph->getElementsByTagName('*') as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            $qualifiedName = $node->nodeName;

            if ($qualifiedName === 'w:t') {
                $parts[] = $node->textContent;

                continue;
            }

            if (in_array($qualifiedName, ['w:tab', 'w:br', 'w:cr'], true)) {
                $parts[] = ' ';
            }
        }

        return $this->normalizeText(implode('', $parts));
    }

    /**
     * @return array<int, string>
     */
    protected function readSharedStrings(ZipArchive $zip): array
    {
        if ($zip->locateName('xl/sharedStrings.xml') === false) {
            return [];
        }

        $document = $this->loadXmlDocument($zip, 'xl/sharedStrings.xml');
        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('main', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $items = $xpath->query('//main:si');

        if ($items === false) {
            return [];
        }

        $values = [];

        foreach ($items as $item) {
            if (! $item instanceof DOMElement) {
                continue;
            }

            $values[] = $this->normalizeText($this->extractNodeText($item));
        }

        return $values;
    }

    /**
     * @return array<string, string>
     */
    protected function readWorkbookSheetMap(ZipArchive $zip): array
    {
        $relationships = [];

        if ($zip->locateName('xl/_rels/workbook.xml.rels') !== false) {
            $relationshipsDocument = $this->loadXmlDocument($zip, 'xl/_rels/workbook.xml.rels');
            $relationshipsXPath = new DOMXPath($relationshipsDocument);
            $relationshipsXPath->registerNamespace('rel', 'http://schemas.openxmlformats.org/package/2006/relationships');
            $relationshipNodes = $relationshipsXPath->query('//rel:Relationship');

            if ($relationshipNodes !== false) {
                foreach ($relationshipNodes as $relationshipNode) {
                    if (! $relationshipNode instanceof DOMElement) {
                        continue;
                    }

                    $target = ltrim((string) $relationshipNode->getAttribute('Target'), '/');

                    if ($target !== '' && ! str_starts_with($target, 'xl/')) {
                        $target = 'xl/'.$target;
                    }

                    $relationships[(string) $relationshipNode->getAttribute('Id')] = $target;
                }
            }
        }

        $document = $this->loadXmlDocument($zip, 'xl/workbook.xml');
        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('main', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $xpath->registerNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
        $sheets = $xpath->query('//main:sheets/main:sheet');

        if ($sheets === false) {
            return [];
        }

        $sheetMap = [];

        foreach ($sheets as $offset => $sheet) {
            if (! $sheet instanceof DOMElement) {
                continue;
            }

            $sheetName = trim((string) $sheet->getAttribute('name')) ?: 'Sheet'.($offset + 1);
            $relationshipId = (string) $sheet->getAttributeNS(
                'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'id',
            );
            $target = $relationships[$relationshipId] ?? sprintf('xl/worksheets/sheet%d.xml', $offset + 1);

            $sheetMap[$sheetName] = $target;
        }

        return $sheetMap;
    }

    /**
     * @param  array<int, string>  $sharedStrings
     */
    protected function extractWorksheetCellText(DOMXPath $xpath, DOMElement $cell, array $sharedStrings): string
    {
        $cellType = (string) $cell->getAttribute('t');

        if ($cellType === 's') {
            $valueNode = $xpath->query('./main:v', $cell)?->item(0);
            $index = is_numeric($valueNode?->textContent) ? (int) $valueNode->textContent : null;

            return $index === null ? '' : $this->normalizeText($sharedStrings[$index] ?? '');
        }

        if ($cellType === 'inlineStr') {
            $inlineNode = $xpath->query('./main:is', $cell)?->item(0);

            if (! $inlineNode instanceof DOMNode) {
                return '';
            }

            return $this->normalizeText($this->extractNodeText($inlineNode));
        }

        if ($cellType === 'str') {
            $valueNode = $xpath->query('./main:v', $cell)?->item(0);

            return $this->normalizeText((string) $valueNode?->textContent);
        }

        return '';
    }

    protected function extractNodeText(DOMNode $node): string
    {
        $parts = [];

        foreach ($node->childNodes as $childNode) {
            if ($childNode instanceof DOMElement) {
                if (in_array($childNode->nodeName, ['t', 'main:t'], true)) {
                    $parts[] = $childNode->textContent;

                    continue;
                }

                $parts[] = $this->extractNodeText($childNode);

                continue;
            }

            if ($childNode->nodeType === XML_TEXT_NODE) {
                $parts[] = $childNode->nodeValue;
            }
        }

        return implode('', $parts);
    }

    /**
     * @param  array<string, array{name: string, sort_order: int, locations: list<array<string, string>>}>  $fields
     * @param  array<string, string>  $baseLocation
     */
    protected function recordPlaceholderMatches(array &$fields, string $text, array $baseLocation): void
    {
        preg_match_all(static::PLACEHOLDER_PATTERN, $text, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);

        foreach ($matches as $match) {
            $name = $match[1][0] ?? null;
            $offset = $match[0][1] ?? null;
            $matchedText = $match[0][0] ?? null;

            if (! is_string($name) || $name === '' || ! is_int($offset) || ! is_string($matchedText)) {
                continue;
            }

            if (! array_key_exists($name, $fields)) {
                $fields[$name] = [
                    'name' => $name,
                    'sort_order' => count($fields) + 1,
                    'locations' => [],
                ];
            }

            $fields[$name]['locations'][] = [
                ...$baseLocation,
                'excerpt' => $this->buildExcerpt($text),
            ];
        }
    }

    protected function normalizeText(string $value): string
    {
        $value = str_replace("\0", '', $value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    protected function buildExcerpt(string $text): string
    {
        $excerpt = $this->normalizeText($text);

        if (mb_strlen($excerpt) > 120) {
            return mb_substr($excerpt, 0, 117).'...';
        }

        return $excerpt;
    }
}
