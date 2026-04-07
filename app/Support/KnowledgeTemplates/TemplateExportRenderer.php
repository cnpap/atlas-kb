<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplate;
use DOMElement;
use DOMXPath;
use RuntimeException;

class TemplateExportRenderer
{
    protected const string PLACEHOLDER_PATTERN = '/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/u';

    /**
     * @param  array<string, string>  $parameters
     */
    public function render(KnowledgeTemplate $template, string $contents, array $parameters): string
    {
        $archive = OfficeOpenXmlArchive::open($contents, 'kb-template-export-');

        try {
            match ($template->template_type) {
                KnowledgeTemplate::TYPE_DOCX => $this->renderDocx($archive, $parameters),
                KnowledgeTemplate::TYPE_XLSX => $this->renderXlsx($archive, $parameters),
                default => throw new RuntimeException('当前模板格式不受支持。'),
            };

            return $archive->getContents();
        } catch (\Throwable $throwable) {
            $archive->discard();

            throw $throwable;
        }
    }

    /**
     * @param  array<string, string>  $parameters
     */
    protected function renderDocx(OfficeOpenXmlArchive $archive, array $parameters): void
    {
        foreach ($archive->entryNamesMatching('#^word/(document|header\d+|footer\d+)\.xml$#') as $entryName) {
            $document = $archive->loadXmlDocument($entryName);
            $xpath = new DOMXPath($document);
            $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
            $paragraphs = $xpath->query('//w:p');

            if ($paragraphs === false) {
                throw new RuntimeException("无法读取模板内部段落节点 [{$entryName}]。");
            }

            foreach ($paragraphs as $paragraph) {
                if ($paragraph instanceof DOMElement) {
                    $this->replaceElementText($xpath, $paragraph, './/*[local-name() = "t"]', $parameters);
                }
            }

            $archive->replaceXmlDocument($entryName, $document);
        }
    }

    /**
     * @param  array<string, string>  $parameters
     */
    protected function renderXlsx(OfficeOpenXmlArchive $archive, array $parameters): void
    {
        if ($archive->hasEntry('xl/sharedStrings.xml')) {
            $sharedStringsDocument = $archive->loadXmlDocument('xl/sharedStrings.xml');
            $sharedStringsXPath = new DOMXPath($sharedStringsDocument);
            $sharedStringsXPath->registerNamespace('main', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $sharedStringItems = $sharedStringsXPath->query('//main:si');

            if ($sharedStringItems === false) {
                throw new RuntimeException('无法读取共享字符串节点。');
            }

            foreach ($sharedStringItems as $item) {
                if ($item instanceof DOMElement) {
                    $this->replaceElementText($sharedStringsXPath, $item, './/*[local-name() = "t"]', $parameters);
                }
            }

            $archive->replaceXmlDocument('xl/sharedStrings.xml', $sharedStringsDocument);
        }

        foreach ($archive->entryNamesMatching('#^xl/worksheets/.+\.xml$#') as $entryName) {
            $document = $archive->loadXmlDocument($entryName);
            $xpath = new DOMXPath($document);
            $xpath->registerNamespace('main', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $inlineStringNodes = $xpath->query('//main:c[@t="inlineStr"]/main:is');

            if ($inlineStringNodes === false) {
                throw new RuntimeException("无法读取工作表内联字符串节点 [{$entryName}]。");
            }

            foreach ($inlineStringNodes as $inlineStringNode) {
                if ($inlineStringNode instanceof DOMElement) {
                    $this->replaceElementText($xpath, $inlineStringNode, './/*[local-name() = "t"]', $parameters);
                }
            }

            $stringValueNodes = $xpath->query('//main:c[@t="str"]/main:v');

            if ($stringValueNodes === false) {
                throw new RuntimeException("无法读取工作表字符串节点 [{$entryName}]。");
            }

            foreach ($stringValueNodes as $stringValueNode) {
                if ($stringValueNode instanceof DOMElement) {
                    $this->assignText(
                        $stringValueNode,
                        $this->replacePlaceholders($stringValueNode->textContent, $parameters),
                    );
                }
            }

            $archive->replaceXmlDocument($entryName, $document);
        }
    }

    /**
     * @param  array<string, string>  $parameters
     */
    protected function replaceElementText(
        DOMXPath $xpath,
        DOMElement $element,
        string $query,
        array $parameters,
    ): void {
        $nodeList = $xpath->query($query, $element);

        if ($nodeList === false) {
            throw new RuntimeException('无法查询模板文本节点。');
        }

        $textNodes = [];

        foreach ($nodeList as $node) {
            if ($node instanceof DOMElement) {
                $textNodes[] = $node;
            }
        }

        $this->replaceTextNodes($textNodes, $parameters);
    }

    /**
     * @param  list<DOMElement>  $textNodes
     * @param  array<string, string>  $parameters
     */
    protected function replaceTextNodes(array $textNodes, array $parameters): void
    {
        if ($textNodes === []) {
            return;
        }

        $fullText = implode('', array_map(
            static fn (DOMElement $node): string => $node->textContent,
            $textNodes,
        ));
        $matches = [];

        preg_match_all(
            static::PLACEHOLDER_PATTERN,
            $fullText,
            $matches,
            PREG_SET_ORDER | PREG_OFFSET_CAPTURE,
        );

        if ($matches === []) {
            return;
        }

        $segments = [];
        $cursor = 0;

        foreach ($textNodes as $node) {
            $text = $node->textContent;
            $length = strlen($text);
            $segments[] = [
                'node' => $node,
                'start' => $cursor,
                'end' => $cursor + $length,
            ];
            $cursor += $length;
        }

        for ($index = count($matches) - 1; $index >= 0; $index -= 1) {
            $match = $matches[$index];
            $rawPlaceholder = $match[0][0];
            $matchOffset = $match[0][1];
            $placeholderName = $match[1][0];
            $replacement = $parameters[$placeholderName]
                ?? throw new RuntimeException("缺少模板参数 [{$placeholderName}]。");
            $matchEnd = $matchOffset + strlen($rawPlaceholder);
            $startSegmentIndex = $this->findSegmentIndex($segments, $matchOffset);
            $endSegmentIndex = $this->findSegmentIndex($segments, $matchEnd - 1);

            if ($startSegmentIndex === null || $endSegmentIndex === null) {
                throw new RuntimeException("无法定位占位符 [{$placeholderName}] 的文本节点。");
            }

            $startNode = $segments[$startSegmentIndex]['node'];
            $endNode = $segments[$endSegmentIndex]['node'];
            $startText = $startNode->textContent;
            $endText = $endNode->textContent;
            $startOffsetInNode = $matchOffset - $segments[$startSegmentIndex]['start'];
            $endOffsetInNode = $matchEnd - $segments[$endSegmentIndex]['start'];
            $prefix = mb_strcut($startText, 0, $startOffsetInNode, 'UTF-8');
            $suffix = mb_strcut($endText, $endOffsetInNode, null, 'UTF-8');

            if ($startSegmentIndex === $endSegmentIndex) {
                $this->assignText($startNode, $prefix.$replacement.$suffix);

                continue;
            }

            $this->assignText($startNode, $prefix.$replacement);

            for ($middleIndex = $startSegmentIndex + 1; $middleIndex < $endSegmentIndex; $middleIndex += 1) {
                $this->assignText($segments[$middleIndex]['node'], '');
            }

            $this->assignText($endNode, $suffix);
        }
    }

    /**
     * @param  list<array{node: DOMElement, start: int, end: int}>  $segments
     */
    protected function findSegmentIndex(array $segments, int $position): ?int
    {
        foreach ($segments as $index => $segment) {
            if ($position >= $segment['start'] && $position < $segment['end']) {
                return $index;
            }
        }

        return null;
    }

    protected function assignText(DOMElement $node, string $value): void
    {
        $node->textContent = $value;

        if (preg_match('/^\s|\s$/u', $value) === 1) {
            $node->setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');

            return;
        }

        $node->removeAttributeNS('http://www.w3.org/XML/1998/namespace', 'space');
    }

    /**
     * @param  array<string, string>  $parameters
     */
    protected function replacePlaceholders(string $value, array $parameters): string
    {
        return (string) preg_replace_callback(
            static::PLACEHOLDER_PATTERN,
            static function (array $match) use ($parameters): string {
                $placeholderName = $match[1];

                if (! array_key_exists($placeholderName, $parameters)) {
                    throw new RuntimeException("缺少模板参数 [{$placeholderName}]。");
                }

                return $parameters[$placeholderName];
            },
            $value,
        );
    }
}
