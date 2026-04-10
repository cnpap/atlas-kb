<?php

use App\Models\KnowledgeAssistantRole;
use Illuminate\Support\Str;

test('builtin assistant role slugs are treated as valid unique ids', function () {
    $role = new class extends KnowledgeAssistantRole
    {
        public function acceptsRouteKey(mixed $value): bool
        {
            return $this->isValidUniqueId($value);
        }
    };

    expect($role->acceptsRouteKey(KnowledgeAssistantRole::BUILTIN_DEFAULT_ID))->toBeTrue()
        ->and($role->acceptsRouteKey((string) Str::uuid()))->toBeTrue()
        ->and($role->acceptsRouteKey('not-a-valid-role-id'))->toBeFalse();
});

test('knowledge assistant role seeder does not overwrite existing builtin records', function () {
    $source = file_get_contents(dirname(__DIR__, 2).'/database/seeders/KnowledgeAssistantRoleSeeder.php');

    expect($source)->toContain('firstOrCreate(')
        ->and($source)->not->toContain('updateOrCreate(');
});
