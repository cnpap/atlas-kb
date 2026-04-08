<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

#[Table(name: 'kb_template_export_tasks', keyType: 'string', incrementing: false)]
#[Fillable([
    'owner_user_id',
    'source_id',
    'source_title',
    'task_type',
    'template_id',
    'template_name',
    'parameters_json',
    'status',
    'failure_message',
    'export_id',
    'started_at',
    'completed_at',
    'failed_at',
    'created_at',
    'updated_at',
])]
class KnowledgeTemplateExportTask extends Model
{
    use HasUuids;

    public const STATUS_PENDING = 'pending';

    public const STATUS_PROCESSING = 'processing';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_FAILED = 'failed';

    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    public function ownerUser(): BelongsTo
    {
        return $this->belongsTo(KnowledgeUser::class, 'owner_user_id');
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(KnowledgeTemplate::class, 'template_id');
    }

    public function export(): BelongsTo
    {
        return $this->belongsTo(KnowledgeTemplateExport::class, 'export_id');
    }

    protected function casts(): array
    {
        return [
            'parameters_json' => 'array',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
            'started_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
            'failed_at' => 'immutable_datetime',
        ];
    }
}
