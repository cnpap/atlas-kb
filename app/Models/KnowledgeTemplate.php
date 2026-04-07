<?php

namespace App\Models;

use App\Support\KnowledgeTemplates\TemplateFileManager;
use Database\Factories\KnowledgeTemplateFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

#[Table(name: 'kb_templates', keyType: 'string', incrementing: false)]
#[Fillable([
    'name',
    'system_prompt',
    'template_type',
    'source_disk',
    'source_path',
    'source_filename',
    'mime_type',
    'byte_size',
    'checksum_sha256',
    'parse_status',
    'parse_error',
    'parser_version',
    'is_active',
    'parsed_at',
])]
class KnowledgeTemplate extends Model
{
    public const TYPE_DOCX = 'docx';

    public const TYPE_XLSX = 'xlsx';

    public const PARSE_STATUS_PENDING = 'pending';

    public const PARSE_STATUS_PROCESSING = 'processing';

    public const PARSE_STATUS_READY = 'ready';

    public const PARSE_STATUS_FAILED = 'failed';

    /** @use HasFactory<KnowledgeTemplateFactory> */
    use HasFactory, HasUuids;

    protected static function booted(): void
    {
        static::deleted(function (KnowledgeTemplate $template): void {
            app(TemplateFileManager::class)->deleteStoredFile(
                $template->source_disk,
                $template->source_path,
            );
        });
    }

    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    /**
     * @return HasMany<KnowledgeTemplateField, covariant $this>
     */
    public function fields(): HasMany
    {
        return $this->hasMany(KnowledgeTemplateField::class, 'template_id')
            ->orderBy('sort_order')
            ->orderBy('created_at');
    }

    /**
     * @return HasMany<KnowledgeTemplateExport, covariant $this>
     */
    public function exports(): HasMany
    {
        return $this->hasMany(KnowledgeTemplateExport::class, 'template_id')
            ->orderByDesc('created_at');
    }

    /**
     * @return BelongsToMany<KnowledgeUser, covariant $this>
     */
    public function assignedKnowledgeUsers(): BelongsToMany
    {
        return $this->belongsToMany(
            KnowledgeUser::class,
            'kb_template_user_assignments',
            'template_id',
            'user_id',
        )->orderBy('username');
    }

    /**
     * @return BelongsToMany<KnowledgeTemplateLibrary, covariant $this>
     */
    public function referenceLibraries(): BelongsToMany
    {
        return $this->belongsToMany(
            KnowledgeTemplateLibrary::class,
            'kb_template_library_assignments',
            'template_id',
            'library_id',
        )->orderBy('name');
    }

    public function scopeAvailable(Builder $query): Builder
    {
        return $query
            ->where('is_active', true)
            ->where('parse_status', self::PARSE_STATUS_READY);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'byte_size' => 'integer',
            'is_active' => 'boolean',
            'parsed_at' => 'immutable_datetime',
        ];
    }
}
