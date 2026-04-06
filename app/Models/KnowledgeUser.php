<?php

namespace App\Models;

use Database\Factories\KnowledgeUserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

#[Table(name: 'users')]
#[Fillable(['name', 'username', 'email', 'password'])]
#[Hidden(['password'])]
class KnowledgeUser extends Model
{
    public const USERNAME_PATTERN = '/^[a-z0-9][a-z0-9._-]{2,63}$/';

    /** @use HasFactory<KnowledgeUserFactory> */
    use HasFactory;

    public static function normalizeUsername(string $value): string
    {
        return Str::lower(trim($value));
    }

    protected static function booted(): void
    {
        static::addGlobalScope('knowledge_users', fn (Builder $query): Builder => $query->whereNotNull('username'));
    }

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
        ];
    }

    protected function username(): Attribute
    {
        return Attribute::make(
            set: fn (string $value): string => static::normalizeUsername($value),
        );
    }
}
