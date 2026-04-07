<?php

namespace App\Models;

use App\Support\KnowledgeTemplates\TemplateLibraryFileManager;
use Database\Factories\KnowledgeTemplateLibraryFileFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

#[Table(name: 'kb_template_library_files', keyType: 'string', incrementing: false)]
#[Fillable([
    'library_id',
    'source_disk',
    'source_path',
    'source_filename',
    'mime_type',
    'byte_size',
    'checksum_sha256',
])]
class KnowledgeTemplateLibraryFile extends Model
{
    /** @use HasFactory<KnowledgeTemplateLibraryFileFactory> */
    use HasFactory, HasUuids;

    protected static function booted(): void
    {
        static::deleting(function (KnowledgeTemplateLibraryFile $file): void {
            app(TemplateLibraryFileManager::class)->deleteStoredFile(
                $file->source_disk,
                $file->source_path,
            );
        });
    }

    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    /**
     * @return BelongsTo<KnowledgeTemplateLibrary, $this>
     */
    public function library(): BelongsTo
    {
        return $this->belongsTo(KnowledgeTemplateLibrary::class, 'library_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'byte_size' => 'integer',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
        ];
    }
}
