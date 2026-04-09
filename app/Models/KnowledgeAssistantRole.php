<?php

namespace App\Models;

use Database\Factories\KnowledgeAssistantRoleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

#[Table(name: 'kb_assistant_roles', keyType: 'string', incrementing: false)]
#[Fillable([
    'owner_user_id',
    'name',
    'system_prompt',
    'style_prompt',
    'is_builtin',
    'is_default',
    'sort_order',
])]
class KnowledgeAssistantRole extends Model
{
    public const BUILTIN_DEFAULT_ID = 'builtin-default-knowledge-assistant';

    /** @use HasFactory<KnowledgeAssistantRoleFactory> */
    use HasFactory, HasUuids, SoftDeletes;

    protected static function booted(): void
    {
        static::saving(function (KnowledgeAssistantRole $role): void {
            if ($role->owner_user_id === null) {
                $role->is_builtin = true;
            } else {
                $role->is_builtin = false;
                $role->is_default = false;
            }

            if ($role->sort_order === null) {
                $role->sort_order = (int) static::query()
                    ->whereNull('deleted_at')
                    ->where('is_builtin', $role->owner_user_id === null)
                    ->max('sort_order') + 1;
            }
        });

        static::saved(function (KnowledgeAssistantRole $role): void {
            if (! $role->is_default) {
                return;
            }

            static::query()
                ->whereKeyNot($role->getKey())
                ->update([
                    'is_default' => false,
                    'updated_at' => now(),
                ]);
        });
    }

    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    public function scopeVisibleToUser(Builder $query, int|string $userId): Builder
    {
        return $query
            ->whereNull('deleted_at')
            ->where(function (Builder $builder) use ($userId): void {
                $builder
                    ->where('is_builtin', true)
                    ->orWhere('owner_user_id', $userId);
            });
    }

    public function scopeBuiltin(Builder $query): Builder
    {
        return $query->where('is_builtin', true);
    }

    /**
     * @return BelongsTo<KnowledgeUser, covariant $this>
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(KnowledgeUser::class, 'owner_user_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_builtin' => 'boolean',
            'is_default' => 'boolean',
            'sort_order' => 'integer',
            'deleted_at' => 'immutable_datetime',
        ];
    }
}
