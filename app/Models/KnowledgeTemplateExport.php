<?php

namespace App\Models;

use Database\Factories\KnowledgeTemplateExportFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

#[Table(name: 'kb_template_exports', keyType: 'string', incrementing: false)]
#[Fillable([
    'template_id',
    'owner_user_id',
    'output_disk',
    'output_path',
    'output_filename',
    'mime_type',
    'byte_size',
    'expires_at',
    'created_at',
])]
class KnowledgeTemplateExport extends Model
{
    /** @use HasFactory<KnowledgeTemplateExportFactory> */
    use HasFactory, HasUuids;

    public const UPDATED_AT = null;

    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    /**
     * @return BelongsTo<KnowledgeTemplate, $this>
     */
    public function template(): BelongsTo
    {
        return $this->belongsTo(KnowledgeTemplate::class, 'template_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function ownerUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function downloadUrl(): string
    {
        return Storage::disk($this->output_disk)->url($this->output_path);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'byte_size' => 'integer',
            'expires_at' => 'immutable_datetime',
            'created_at' => 'immutable_datetime',
        ];
    }
}
