<?php

namespace App\Support\KnowledgeTemplates;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateExport;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class TemplateExportService
{
    public function __construct(
        protected TemplateFileManager $fileManager,
        protected TemplateExportRenderer $renderer,
    ) {}

    /**
     * @param  array<string, string>  $parameters
     */
    public function create(
        KnowledgeTemplate $template,
        User $ownerUser,
        array $parameters,
    ): KnowledgeTemplateExport {
        $sourceContents = $this->fileManager->readStoredBytes($template);
        $outputContents = $this->renderer->render($template, $sourceContents, $parameters);
        $disk = (string) config('knowledge-templates.exports.disk');
        $directory = trim((string) config('knowledge-templates.exports.directory'), '/');
        $outputPath = implode('/', array_filter([
            $directory,
            now()->format('Y/m/d'),
            (string) $ownerUser->getKey(),
            Str::uuid().'.'.$template->template_type,
        ]));
        $mimeType = $this->fileManager->mimeTypeForType($template->template_type);
        $stored = Storage::disk($disk)->put($outputPath, $outputContents, [
            'visibility' => 'public',
            'ContentType' => $mimeType,
        ]);

        if (! $stored) {
            throw new \RuntimeException('导出文件上传到对象存储失败。');
        }

        try {
            return DB::transaction(function () use ($template, $ownerUser, $disk, $outputPath, $outputContents, $mimeType): KnowledgeTemplateExport {
                return KnowledgeTemplateExport::query()->create([
                    'template_id' => $template->getKey(),
                    'owner_user_id' => $ownerUser->getKey(),
                    'output_disk' => $disk,
                    'output_path' => $outputPath,
                    'output_filename' => $this->buildOutputFilename($template),
                    'mime_type' => $mimeType,
                    'byte_size' => strlen($outputContents),
                    'expires_at' => now()->addDays((int) config('knowledge-templates.exports.retention_days')),
                    'created_at' => now(),
                ]);
            });
        } catch (Throwable $throwable) {
            $this->fileManager->deleteStoredFile($disk, $outputPath);

            throw $throwable;
        }
    }

    protected function buildOutputFilename(KnowledgeTemplate $template): string
    {
        $resolvedBaseName = Str::slug(Str::transliterate($template->name));

        if ($resolvedBaseName === '') {
            $resolvedBaseName = $template->getKey();
        }

        return sprintf(
            '%s-%s.%s',
            $resolvedBaseName,
            now()->format('YmdHis'),
            $template->template_type,
        );
    }
}
