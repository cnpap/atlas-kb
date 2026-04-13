<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;
use RuntimeException;

class TemplateFileManager
{
    /**
     * @return array{
     *     template_type: string,
     *     source_disk: string,
     *     source_path: string,
     *     source_filename: string,
     *     mime_type: string,
     *     byte_size: int,
     *     checksum_sha256: string
     * }
     */
    public function storeUpload(TemporaryUploadedFile $file): array
    {
        $sourceFilename = $file->getClientOriginalName();
        $templateType = $this->detectTemplateType($sourceFilename);
        $mimeType = $this->mimeTypeForType($templateType);
        $disk = (string) config('knowledge-templates.storage_disk');
        $directory = trim((string) config('knowledge-templates.storage_directory'), '/');
        $realPath = $file->getRealPath();

        if (! is_string($realPath) || $realPath === '' || ! is_file($realPath)) {
            throw new RuntimeException('无法读取上传的模板文件。');
        }

        $byteSize = filesize($realPath);

        if ($byteSize === false || $byteSize <= 0) {
            throw new RuntimeException('无法读取上传的模板文件。');
        }

        $checksum = hash_file('sha256', $realPath);

        if (! is_string($checksum)) {
            throw new RuntimeException('无法读取上传的模板文件。');
        }

        $extension = strtolower(pathinfo($sourceFilename, PATHINFO_EXTENSION));
        $sourcePath = implode('/', array_filter([
            $directory,
            now()->format('Y/m/d'),
            Str::uuid().'.'.$extension,
        ]));

        $stream = fopen($realPath, 'rb');

        if ($stream === false) {
            throw new RuntimeException('无法读取上传的模板文件。');
        }

        try {
            $stored = Storage::disk($disk)->put($sourcePath, $stream, [
                'visibility' => 'private',
                'ContentType' => $mimeType,
            ]);
        } finally {
            fclose($stream);
        }

        if (! $stored) {
            throw new RuntimeException('模板文件上传到对象存储失败。');
        }

        return [
            'template_type' => $templateType,
            'source_disk' => $disk,
            'source_path' => $sourcePath,
            'source_filename' => $sourceFilename,
            'mime_type' => $mimeType,
            'byte_size' => $byteSize,
            'checksum_sha256' => $checksum,
        ];
    }

    public function readStoredBytes(KnowledgeTemplate $template): string
    {
        $contents = Storage::disk($template->source_disk)->get($template->source_path);

        if (! is_string($contents) || $contents === '') {
            throw new RuntimeException('模板源文件为空或读取失败。');
        }

        return $contents;
    }

    public function deleteStoredFile(string $disk, string $path): void
    {
        Storage::disk($disk)->delete($path);
    }

    public function detectTemplateType(string $sourceFilename): string
    {
        $extension = strtolower(pathinfo($sourceFilename, PATHINFO_EXTENSION));

        return match ($extension) {
            KnowledgeTemplate::TYPE_DOCX => KnowledgeTemplate::TYPE_DOCX,
            KnowledgeTemplate::TYPE_XLSX => KnowledgeTemplate::TYPE_XLSX,
            default => throw new InvalidArgumentException('仅支持上传 docx 与 xlsx 模板文件。'),
        };
    }

    public function mimeTypeForType(string $templateType): string
    {
        return match ($templateType) {
            KnowledgeTemplate::TYPE_DOCX => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            KnowledgeTemplate::TYPE_XLSX => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            default => throw new InvalidArgumentException('不支持的模板类型。'),
        };
    }
}
