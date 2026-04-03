<?php

namespace App\Models;

use Database\Factories\KnowledgeUserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

#[Table(name: 'kb_users', keyType: 'string', incrementing: false)]
#[Fillable(['username', 'password_hash'])]
#[Hidden(['password_hash'])]
class KnowledgeUser extends Model
{
    public const USERNAME_PATTERN = '/^[a-z0-9][a-z0-9._-]{2,63}$/';

    /** @use HasFactory<KnowledgeUserFactory> */
    use HasFactory, HasUuids;

    public static function normalizeUsername(string $value): string
    {
        return Str::lower(trim($value));
    }

    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    protected function username(): Attribute
    {
        return Attribute::make(
            set: fn (string $value): string => static::normalizeUsername($value),
        );
    }
}
