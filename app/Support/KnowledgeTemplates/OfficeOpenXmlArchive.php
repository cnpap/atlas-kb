<?php

namespace App\Support\KnowledgeTemplates;

use DOMDocument;
use RuntimeException;
use ZipArchive;

class OfficeOpenXmlArchive
{
    private function __construct(
        protected string $temporaryPath,
        protected ZipArchive $zip,
    ) {}

    public static function open(string $contents, string $temporaryPrefix = 'kb-ooxml-'): self
    {
        $temporaryPath = tempnam(sys_get_temp_dir(), $temporaryPrefix);

        if ($temporaryPath === false) {
            throw new RuntimeException('无法创建 Office Open XML 临时文件。');
        }

        if (file_put_contents($temporaryPath, $contents) === false) {
            @unlink($temporaryPath);

            throw new RuntimeException('无法写入 Office Open XML 临时文件。');
        }

        $zip = new ZipArchive;
        $opened = $zip->open($temporaryPath);

        if ($opened !== true) {
            @unlink($temporaryPath);

            throw new RuntimeException('模板文件不是有效的 Office Open XML 压缩包。');
        }

        return new self($temporaryPath, $zip);
    }

    public function entryNamesMatching(string $pattern): array
    {
        $entryNames = [];

        for ($index = 0; $index < $this->zip->numFiles; $index += 1) {
            $entryName = $this->zip->getNameIndex($index);

            if (is_string($entryName) && preg_match($pattern, $entryName) === 1) {
                $entryNames[] = $entryName;
            }
        }

        sort($entryNames);

        return $entryNames;
    }

    public function hasEntry(string $entryName): bool
    {
        return $this->zip->locateName($entryName) !== false;
    }

    public function loadXmlDocument(string $entryName): DOMDocument
    {
        $contents = $this->zip->getFromName($entryName);

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

    public function replaceXmlDocument(string $entryName, DOMDocument $document): void
    {
        if (! $this->hasEntry($entryName)) {
            throw new RuntimeException("模板内部文件 [{$entryName}] 不存在。");
        }

        $contents = $document->saveXML();

        if (! is_string($contents)) {
            throw new RuntimeException("无法写回模板内部文件 [{$entryName}]。");
        }

        if (! $this->zip->deleteName($entryName)) {
            throw new RuntimeException("无法更新模板内部文件 [{$entryName}]。");
        }

        if (! $this->zip->addFromString($entryName, $contents)) {
            throw new RuntimeException("无法写回模板内部文件 [{$entryName}]。");
        }
    }

    public function getContents(): string
    {
        if (! $this->zip->close()) {
            throw new RuntimeException('无法关闭 Office Open XML 压缩包。');
        }

        $contents = file_get_contents($this->temporaryPath);
        @unlink($this->temporaryPath);

        if (! is_string($contents) || $contents === '') {
            throw new RuntimeException('无法读取生成后的 Office Open XML 文件。');
        }

        return $contents;
    }

    public function discard(): void
    {
        $this->zip->close();
        @unlink($this->temporaryPath);
    }
}
