<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeTemplateLibraryFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;
use RuntimeException;

class TemplateLibraryFileManager
{
    /**
     * @return array{
     *     source_disk: string,
     *     source_path: string,
     *     source_filename: string,
     *     mime_type: string,
     *     byte_size: int,
     *     checksum_sha256: string
     * }
     */
    public function storeUpload(TemporaryUploadedFile $file, KnowledgeTemplateLibrary $library): array
    {
        $contents = file_get_contents($file->getRealPath());

        if ($contents === false) {
            throw new RuntimeException('无法读取上传的资料文件。');
        }

        $sourceFilename = $this->sanitizeSourceFilename($file->getClientOriginalName());
        $mimeType = (string) ($file->getMimeType() ?: 'application/octet-stream');
        $sourceDisk = $this->disk();
        $sourcePath = implode('/', array_filter([
            $library->storage_prefix,
            now()->format('Y/m/d'),
            Str::uuid().'-'.$sourceFilename,
        ]));

        $stored = Storage::disk($sourceDisk)->put($sourcePath, $contents, [
            'visibility' => 'private',
            'ContentType' => $mimeType,
        ]);

        if (! $stored) {
            throw new RuntimeException('资料文件上传到对象存储失败。');
        }

        return [
            'source_disk' => $sourceDisk,
            'source_path' => $sourcePath,
            'source_filename' => $sourceFilename,
            'mime_type' => $mimeType,
            'byte_size' => strlen($contents),
            'checksum_sha256' => hash('sha256', $contents),
        ];
    }

    public function deleteStoredFile(string $disk, string $path): void
    {
        Storage::disk($disk)->delete($path);
    }

    public function deleteLibraryFiles(KnowledgeTemplateLibrary $library): void
    {
        $library->files()
            ->get(['source_disk', 'source_path'])
            ->each(function (KnowledgeTemplateLibraryFile $file): void {
                $this->deleteStoredFile($file->source_disk, $file->source_path);
            });
    }

    protected function disk(): string
    {
        return (string) config('knowledge-templates.reference_libraries.disk');
    }

    protected function sanitizeSourceFilename(string $filename): string
    {
        $sanitized = str_replace(['\\', '/', "\0"], '-', trim($filename));

        return $sanitized !== '' ? $sanitized : 'file';
    }
}
