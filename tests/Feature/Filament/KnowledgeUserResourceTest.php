<?php

use App\Filament\Resources\KnowledgeUsers\KnowledgeUserResource;
use App\Filament\Resources\KnowledgeUsers\Pages\CreateKnowledgeUser;
use App\Filament\Resources\KnowledgeUsers\Pages\EditKnowledgeUser;
use App\Models\KnowledgeUser;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Livewire\Livewire;

test('admin users can access the knowledge user resource', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeUserResource::getUrl());

    $response->assertOk();
});

test('knowledge user create page is rendered in simplified chinese', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeUserResource::getUrl('create'));

    $response->assertOk();
    $response->assertSee('知识库用户');
    $response->assertSee('用户名');
    $response->assertSee('密码');
});

test('admin users can create a knowledge user from filament', function () {
    $admin = createAdminUser();

    $this->actingAs($admin);

    Livewire::test(CreateKnowledgeUser::class)
        ->assertOk()
        ->fillForm([
            'username' => 'atlas.admin',
            'password' => 'secret-password',
        ])
        ->call('create')
        ->assertHasNoFormErrors()
        ->assertRedirect();

    $knowledgeUser = KnowledgeUser::query()->sole();

    expect($knowledgeUser->username)->toBe('atlas.admin')
        ->and($knowledgeUser->id)->toBeInt()
        ->and(Hash::check('secret-password', $knowledgeUser->password))->toBeTrue();
});

test('editing a knowledge user keeps the password hash when password is blank', function () {
    $admin = createAdminUser();
    $knowledgeUser = KnowledgeUser::factory()->create([
        'username' => 'alpha.user',
    ]);

    $originalPasswordHash = $knowledgeUser->password;

    $this->actingAs($admin);

    Livewire::test(EditKnowledgeUser::class, ['record' => $knowledgeUser->getKey()])
        ->assertOk()
        ->fillForm([
            'username' => 'beta.user',
            'password' => '',
        ])
        ->call('save')
        ->assertHasNoFormErrors();

    $knowledgeUser->refresh();

    expect($knowledgeUser->username)->toBe('beta.user')
        ->and($knowledgeUser->password)->toBe($originalPasswordHash);
});

test('editing a knowledge user can reset the password hash', function () {
    $admin = createAdminUser();
    $knowledgeUser = KnowledgeUser::factory()->create();

    $originalPasswordHash = $knowledgeUser->password;

    $this->actingAs($admin);

    Livewire::test(EditKnowledgeUser::class, ['record' => $knowledgeUser->getKey()])
        ->fillForm([
            'username' => $knowledgeUser->username,
            'password' => 'new-secret-password',
        ])
        ->call('save')
        ->assertHasNoFormErrors();

    $knowledgeUser->refresh();

    expect($knowledgeUser->password)->not->toBe($originalPasswordHash)
        ->and(Hash::check('new-secret-password', $knowledgeUser->password))->toBeTrue();
});

test('deleting a knowledge user cascades through dependent kb tables', function () {
    $knowledgeUser = KnowledgeUser::factory()->create();
    $collectionId = (string) fake()->uuid();
    $sourceId = (string) fake()->uuid();
    $assistantRoleId = (string) fake()->uuid();
    $chatSessionId = (string) fake()->uuid();
    $chatMessageId = (string) fake()->uuid();
    $chatFeedbackId = (string) fake()->uuid();
    $briefingExportId = (string) fake()->uuid();
    $now = now();

    DB::table('kb_collections')->insert([
        'id' => $collectionId,
        'owner_user_id' => $knowledgeUser->getKey(),
        'name' => 'Operations',
        'description' => 'Ops knowledge',
        'color' => 'amber',
        'icon' => 'book-open-text',
        'is_pinned' => false,
        'created_at' => $now,
        'updated_at' => $now,
        'last_activity_at' => $now,
    ]);

    DB::table('kb_sources')->insert([
        'id' => $sourceId,
        'owner_user_id' => $knowledgeUser->getKey(),
        'collection_id' => $collectionId,
        'document_id' => 'doc-1',
        'content' => 'Content',
        'source_type' => 'text',
        'status' => 'ready',
        'source_filename' => 'doc-1.txt',
        'mime_type' => 'text/plain',
        'byte_size' => 10,
        'failure_message' => null,
        'index_chunk_count' => 0,
        'created_at' => $now,
        'updated_at' => $now,
    ]);

    DB::table('kb_assistant_roles')->insert([
        'id' => $assistantRoleId,
        'owner_user_id' => $knowledgeUser->getKey(),
        'name' => '自定义角色',
        'system_prompt' => '回答时优先引用证据。',
        'style_prompt' => '保持简洁。',
        'is_builtin' => false,
        'is_default' => false,
        'sort_order' => 0,
        'created_at' => $now,
        'updated_at' => $now,
        'deleted_at' => null,
    ]);

    DB::table('kb_user_settings')->insert([
        'user_id' => $knowledgeUser->getKey(),
        'active_assistant_role_id' => $assistantRoleId,
        'created_at' => $now,
        'updated_at' => $now,
    ]);

    DB::table('kb_chat_sessions')->insert([
        'id' => $chatSessionId,
        'owner_user_id' => $knowledgeUser->getKey(),
        'title' => 'Ops chat',
        'collection_id' => $collectionId,
        'preview' => 'Preview',
        'created_at' => $now,
        'updated_at' => $now,
        'last_message_at' => $now,
    ]);

    DB::table('kb_chat_messages')->insert([
        'id' => $chatMessageId,
        'owner_user_id' => $knowledgeUser->getKey(),
        'session_id' => $chatSessionId,
        'assistant_role_id' => $assistantRoleId,
        'role' => 'user',
        'content' => 'Hello',
        'citations_json' => json_encode([], JSON_THROW_ON_ERROR),
        'retrieval_json' => null,
        'trace_json' => null,
        'created_at' => $now,
    ]);

    DB::table('kb_chat_feedback')->insert([
        'id' => $chatFeedbackId,
        'owner_user_id' => $knowledgeUser->getKey(),
        'message_id' => $chatMessageId,
        'rating' => 'up',
        'note' => null,
        'created_at' => $now,
    ]);

    DB::table('kb_briefing_exports')->insert([
        'id' => $briefingExportId,
        'owner_user_id' => $knowledgeUser->getKey(),
        'source_id' => $sourceId,
        'document_id' => 'doc-1',
        'title' => 'Briefing',
        'summary' => 'Summary',
        'form_json' => json_encode(['tone' => 'neutral'], JSON_THROW_ON_ERROR),
        'citations_json' => json_encode([], JSON_THROW_ON_ERROR),
        'created_at' => $now,
    ]);

    $knowledgeUser->delete();

    expect(DB::table('kb_collections')->where('id', $collectionId)->exists())->toBeFalse()
        ->and(DB::table('kb_sources')->where('id', $sourceId)->exists())->toBeFalse()
        ->and(DB::table('kb_assistant_roles')->where('id', $assistantRoleId)->exists())->toBeFalse()
        ->and(DB::table('kb_user_settings')->where('user_id', $knowledgeUser->getKey())->exists())->toBeFalse()
        ->and(DB::table('kb_chat_sessions')->where('id', $chatSessionId)->exists())->toBeFalse()
        ->and(DB::table('kb_chat_messages')->where('id', $chatMessageId)->exists())->toBeFalse()
        ->and(DB::table('kb_chat_feedback')->where('id', $chatFeedbackId)->exists())->toBeFalse()
        ->and(DB::table('kb_briefing_exports')->where('id', $briefingExportId)->exists())->toBeFalse();
});
