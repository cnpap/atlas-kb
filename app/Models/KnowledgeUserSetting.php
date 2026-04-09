<?php

namespace App\Models;

use Database\Factories\KnowledgeUserSettingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Table(name: 'kb_user_settings')]
#[Fillable([
    'user_id',
    'active_assistant_role_id',
])]
class KnowledgeUserSetting extends Model
{
    /** @use HasFactory<KnowledgeUserSettingFactory> */
    use HasFactory;

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    /**
     * @return BelongsTo<KnowledgeAssistantRole, covariant $this>
     */
    public function activeAssistantRole(): BelongsTo
    {
        return $this->belongsTo(KnowledgeAssistantRole::class, 'active_assistant_role_id');
    }

    /**
     * @return BelongsTo<KnowledgeUser, covariant $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(KnowledgeUser::class, 'user_id');
    }
}
