<?php

use App\Filament\Resources\KnowledgeAssistantRoles\KnowledgeAssistantRoleResource;
use App\Filament\Resources\KnowledgeAssistantRoles\Pages\CreateKnowledgeAssistantRole;
use App\Filament\Resources\KnowledgeAssistantRoles\Pages\EditKnowledgeAssistantRole;
use App\Models\KnowledgeAssistantRole;
use App\Models\KnowledgeUser;
use Livewire\Livewire;

test('admin users can access the knowledge assistant role resource', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeAssistantRoleResource::getUrl());

    $response->assertOk();
});

test('knowledge assistant role create page is rendered in simplified chinese', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeAssistantRoleResource::getUrl('create'));

    $response->assertOk();
    $response->assertSee('知识角色');
    $response->assertSee('基础信息');
    $response->assertSee('系统提示词');
    $response->assertSee('风格提示词');
    $response->assertSee('设为默认角色');
});

test('knowledge assistant role list only includes builtin roles', function () {
    $admin = createAdminUser();
    $builtinRole = KnowledgeAssistantRole::factory()->builtin()->create([
        'name' => '内置政策助手',
    ]);
    $privateRole = KnowledgeAssistantRole::factory()->privateRole(KnowledgeUser::factory()->create())->create([
        'name' => '私有角色',
    ]);

    $response = $this->actingAs($admin)->get(KnowledgeAssistantRoleResource::getUrl());

    $response->assertOk();
    $response->assertSee($builtinRole->name);
    $response->assertDontSee($privateRole->name);
});

test('admin users can create a builtin assistant role from filament', function () {
    $admin = createAdminUser();
    $expectedSortOrder = ((int) KnowledgeAssistantRole::query()->max('sort_order')) + 1;

    $this->actingAs($admin);

    Livewire::test(CreateKnowledgeAssistantRole::class)
        ->assertOk()
        ->fillForm([
            'name' => '风险研判助手',
            'system_prompt' => "先提炼事实，再输出判断。\n不要虚构材料。",
            'style_prompt' => "先给结论。\n再列要点。",
            'is_default' => false,
        ])
        ->call('create')
        ->assertHasNoFormErrors()
        ->assertRedirect();

    $role = KnowledgeAssistantRole::query()->sole();

    expect($role->name)->toBe('风险研判助手')
        ->and($role->owner_user_id)->toBeNull()
        ->and($role->is_builtin)->toBeTrue()
        ->and($role->is_default)->toBeFalse()
        ->and($role->sort_order)->toBe($expectedSortOrder);
});

test('setting a builtin assistant role as default clears the previous default flag', function () {
    $admin = createAdminUser();
    $originalDefaultRole = KnowledgeAssistantRole::factory()->defaultRole()->create([
        'name' => '默认角色',
    ]);
    $candidateRole = KnowledgeAssistantRole::factory()->builtin()->create([
        'name' => '候选角色',
    ]);

    $this->actingAs($admin);

    Livewire::test(EditKnowledgeAssistantRole::class, [
        'record' => $candidateRole->getRouteKey(),
    ])
        ->assertOk()
        ->fillForm([
            'name' => '候选角色',
            'system_prompt' => $candidateRole->system_prompt,
            'style_prompt' => $candidateRole->style_prompt,
            'is_default' => true,
        ])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($candidateRole->fresh()?->is_default)->toBeTrue()
        ->and($originalDefaultRole->fresh()?->is_default)->toBeFalse();
});
