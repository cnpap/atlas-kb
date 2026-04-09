<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplate;
use DOMElement;
use DOMNode;
use DOMXPath;
use RuntimeException;

class TemplateParser
{
    protected const string PLACEHOLDER_PATTERN = '/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/u';

    /**
     * @return array{
     *     template_type: string,
     *     fields: list<array{
     *         name: string,
     *         placeholder_name: string,
     *         sort_order: int,
     *     }>
     * }
     */
    public function parse(string $contents, string $sourceFilename): array
    {
        $templateType = strtolower(pathinfo($sourceFilename, PATHINFO_EXTENSION));
        $archive = OfficeOpenXmlArchive::open($contents, 'kb-template-');

        try {
            $fields = match ($templateType) {
                KnowledgeTemplate::TYPE_DOCX => $this->parseDocx($archive),
                KnowledgeTemplate::TYPE_XLSX => $this->parseXlsx($archive),
                default => throw new RuntimeException('当前模板格式不受支持。'),
            };
        } finally {
            $archive->discard();
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
     * @return array<string, array{name: string, placeholder_name: string, sort_order: int}>
     */
    protected function parseDocx(OfficeOpenXmlArchive $archive): array
    {
        $fields = [];

        foreach ($archive->entryNamesMatching('#^word/(document|header\d+|footer\d+)\.xml$#') as $entryName) {
            $document = $archive->loadXmlDocument($entryName);
            $xpath = new DOMXPath($document);
            $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
            $paragraphs = $xpath->query('//w:p');

            if ($paragraphs === false) {
                throw new RuntimeException("无法读取模板段落节点 [{$entryName}]。");
            }

            foreach ($paragraphs as $paragraph) {
                if (! $paragraph instanceof DOMElement) {
                    continue;
                }

                $text = $this->extractDocxParagraphText($paragraph);

                if ($text !== '') {
                    $this->recordPlaceholderMatches($fields, $text);
                }
            }
        }

        return $fields;
    }

    /**
     * @return array<string, array{name: string, placeholder_name: string, sort_order: int}>
     */
    protected function parseXlsx(OfficeOpenXmlArchive $archive): array
    {
        $fields = [];
        $sharedStrings = $this->readSharedStrings($archive);
        $sheetMap = $this->readWorkbookSheetMap($archive);

        foreach ($sheetMap as $entryName) {
            $document = $archive->loadXmlDocument($entryName);
            $xpath = new DOMXPath($document);
            $xpath->registerNamespace('main', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $cells = $xpath->query('//main:c');

            if ($cells === false) {
                throw new RuntimeException("无法读取工作表单元格节点 [{$entryName}]。");
            }

            foreach ($cells as $cell) {
                if (! $cell instanceof DOMElement) {
                    continue;
                }

                $text = $this->extractWorksheetCellText($xpath, $cell, $sharedStrings);

                if ($text !== '') {
                    $this->recordPlaceholderMatches($fields, $text);
                }
            }
        }

        return $fields;
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
    protected function readSharedStrings(OfficeOpenXmlArchive $archive): array
    {
        if (! $archive->hasEntry('xl/sharedStrings.xml')) {
            return [];
        }

        $document = $archive->loadXmlDocument('xl/sharedStrings.xml');
        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('main', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $items = $xpath->query('//main:si');

        if ($items === false) {
            throw new RuntimeException('无法读取共享字符串节点。');
        }

        $values = [];

        foreach ($items as $item) {
            if ($item instanceof DOMElement) {
                $values[] = $this->normalizeText($this->extractNodeText($item));
            }
        }

        return $values;
    }

    /**
     * @return array<string, string>
     */
    protected function readWorkbookSheetMap(OfficeOpenXmlArchive $archive): array
    {
        $relationships = [];

        if ($archive->hasEntry('xl/_rels/workbook.xml.rels')) {
            $relationshipsDocument = $archive->loadXmlDocument('xl/_rels/workbook.xml.rels');
            $relationshipsXPath = new DOMXPath($relationshipsDocument);
            $relationshipsXPath->registerNamespace('rel', 'http://schemas.openxmlformats.org/package/2006/relationships');
            $relationshipNodes = $relationshipsXPath->query('//rel:Relationship');

            if ($relationshipNodes === false) {
                throw new RuntimeException('无法读取工作簿关系节点。');
            }

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

        $document = $archive->loadXmlDocument('xl/workbook.xml');
        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('main', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
        $xpath->registerNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
        $sheets = $xpath->query('//main:sheets/main:sheet');

        if ($sheets === false) {
            throw new RuntimeException('无法读取工作簿工作表节点。');
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
                $parts[] = $childNode->textContent;
            }
        }

        return implode('', $parts);
    }

    /**
     * @param  array<string, array{name: string, placeholder_name: string, sort_order: int}>  $fields
     */
    protected function recordPlaceholderMatches(array &$fields, string $text): void
    {
        preg_match_all(static::PLACEHOLDER_PATTERN, $text, $matches);

        foreach ($matches[1] as $placeholderName) {
            if (! is_string($placeholderName) || $placeholderName === '') {
                continue;
            }

            if (! array_key_exists($placeholderName, $fields)) {
                $fields[$placeholderName] = [
                    'name' => 'value_'.(count($fields) + 1),
                    'placeholder_name' => $placeholderName,
                    'sort_order' => count($fields) + 1,
                ];
            }
        }
    }

    protected function normalizeText(string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    }
}
