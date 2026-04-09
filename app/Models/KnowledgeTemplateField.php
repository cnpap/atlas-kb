<?php

namespace App\Models;

use Database\Factories\KnowledgeTemplateFieldFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

#[Table(name: 'kb_template_fields', keyType: 'string', incrementing: false)]
#[Fillable([
    'template_id',
    'name',
    'placeholder_name',
    'label',
    'description',
    'meta_source',
    'sort_order',
])]
class KnowledgeTemplateField extends Model
{
    public const META_SOURCE_DEFAULT = 'default';

    public const META_SOURCE_AI = 'ai';

    public const META_SOURCE_MANUAL = 'manual';

    /** @use HasFactory<KnowledgeTemplateFieldFactory> */
    use HasFactory, HasUuids;

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
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
        ];
    }
}
