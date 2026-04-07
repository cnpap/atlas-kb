<?php

namespace App\Models;

use App\Support\KnowledgeTemplates\TemplateLibraryFileManager;
use Database\Factories\KnowledgeTemplateLibraryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

#[Table(name: 'kb_template_libraries', keyType: 'string', incrementing: false)]
#[Fillable(['name', 'storage_prefix'])]
class KnowledgeTemplateLibrary extends Model
{
    /** @use HasFactory<KnowledgeTemplateLibraryFactory> */
    use HasFactory, HasUuids;

    public const STORAGE_PREFIX_PATTERN = '/^(?!.*(?:^|\/)\.\.?(?:\/|$))[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/';

    protected static function booted(): void
    {
        static::deleting(function (KnowledgeTemplateLibrary $library): void {
            app(TemplateLibraryFileManager::class)->deleteLibraryFiles($library);
        });
    }

    public static function normalizeStoragePrefix(string $value): string
    {
        $normalized = str_replace('\\', '/', trim($value));
        $normalized = preg_replace('#/+#', '/', $normalized) ?? $normalized;

        return Str::of($normalized)
            ->trim('/')
            ->lower()
            ->value();
    }

    public static function isValidStoragePrefix(string $value): bool
    {
        $normalized = static::normalizeStoragePrefix($value);

        if ($normalized === '') {
            return false;
        }

        return preg_match(self::STORAGE_PREFIX_PATTERN, $normalized) === 1;
    }

    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    /**
     * @return HasMany<KnowledgeTemplateLibraryFile, covariant $this>
     */
    public function files(): HasMany
    {
        return $this->hasMany(KnowledgeTemplateLibraryFile::class, 'library_id')
            ->orderByDesc('created_at');
    }

    /**
     * @return BelongsToMany<KnowledgeTemplate, covariant $this>
     */
    public function templates(): BelongsToMany
    {
        return $this->belongsToMany(
            KnowledgeTemplate::class,
            'kb_template_library_assignments',
            'library_id',
            'template_id',
        )->orderBy('name');
    }

    protected function storagePrefix(): Attribute
    {
        return Attribute::make(
            set: fn (string $value): string => static::normalizeStoragePrefix($value),
        );
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
        ];
    }
}
