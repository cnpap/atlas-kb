<?php

use App\Filament\Resources\KnowledgeTemplateLibraries\KnowledgeTemplateLibraryResource;
use App\Filament\Resources\KnowledgeTemplateLibraries\Pages\CreateKnowledgeTemplateLibrary;
use App\Filament\Resources\KnowledgeTemplateLibraries\Pages\EditKnowledgeTemplateLibrary;
use App\Filament\Resources\KnowledgeTemplateLibraries\RelationManagers\FilesRelationManager;
use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeTemplateLibraryFile;
use App\Models\User;
use App\Support\KnowledgeTemplates\TemplateLibraryFileManager;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;

test('admin users can access the knowledge template library resource', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeTemplateLibraryResource::getUrl());

    $response->assertOk();
    $response->assertSee('模板资料库');
});

test('knowledge template library create page is rendered in simplified chinese', function () {
    $admin = createAdminUser();

    $response = $this->actingAs($admin)->get(KnowledgeTemplateLibraryResource::getUrl('create'));

    $response->assertOk();
    $response->assertSee('资料库名称');
    $response->assertSee('存储前缀');
});

test('admin users can create a knowledge template library from filament', function () {
    $admin = createAdminUser();

    $this->actingAs($admin);

    Livewire::test(CreateKnowledgeTemplateLibrary::class)
        ->assertOk()
        ->fillForm([
            'name' => '政策资料库',
            'storage_prefix' => 'OPS/Manuals',
        ])
        ->call('create')
        ->assertHasNoFormErrors()
        ->assertRedirect();

    $library = KnowledgeTemplateLibrary::query()->sole();

    expect($library->name)->toBe('政策资料库')
        ->and($library->storage_prefix)->toBe('ops/manuals');
});

test('library files relation manager can upload multiple files and delete a file', function () {
    Storage::fake('kb_templates');
    config()->set('knowledge-templates.reference_libraries.disk', 'kb_templates');
    config()->set('knowledge-templates.reference_libraries.max_upload_kb', 102400);

    $admin = createAdminUser();
    $library = KnowledgeTemplateLibrary::factory()->create([
        'name' => '制度资料库',
        'storage_prefix' => 'ops/policies',
    ]);

    $this->actingAs($admin);

    $firstFile = UploadedFile::fake()->create('runbook.pdf', 10, 'application/pdf');
    $secondFile = UploadedFile::fake()->create('guide.txt', 5, 'text/plain');

    Livewire::test(FilesRelationManager::class, [
        'ownerRecord' => $library,
        'pageClass' => EditKnowledgeTemplateLibrary::class,
    ])
        ->callTableAction('uploadFiles', data: [
            'files' => [$firstFile, $secondFile],
        ])
        ->assertHasNoErrors();

    $library->refresh();

    expect($library->files()->count())->toBe(2);

    $storedFiles = KnowledgeTemplateLibraryFile::query()
        ->where('library_id', $library->getKey())
        ->get();

    foreach ($storedFiles as $storedFile) {
        Storage::disk('kb_templates')->assertExists($storedFile->source_path);
    }

    $fileToDelete = $storedFiles->first();

    expect($fileToDelete)->toBeInstanceOf(KnowledgeTemplateLibraryFile::class);

    Livewire::test(FilesRelationManager::class, [
        'ownerRecord' => $library,
        'pageClass' => EditKnowledgeTemplateLibrary::class,
    ])
        ->callTableAction('delete', $fileToDelete->getKey())
        ->assertHasNoErrors();

    Storage::disk('kb_templates')->assertMissing($fileToDelete->source_path);
    expect(KnowledgeTemplateLibraryFile::query()->whereKey($fileToDelete->getKey())->exists())->toBeFalse();
});

test('reference library file deletion reports object storage failures', function () {
    Storage::shouldReceive('disk')
        ->once()
        ->with('kb_templates')
        ->andReturn(new class
        {
            public function delete(string $path): bool
            {
                expect($path)->toBe('ops/policies/missing.pdf');

                return false;
            }
        });

    expect(fn () => app(TemplateLibraryFileManager::class)->deleteStoredFile(
        'kb_templates',
        'ops/policies/missing.pdf',
    ))->toThrow(RuntimeException::class, '资料文件从对象存储删除失败');
});

test('non admin users cannot access the knowledge template library resource', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(KnowledgeTemplateLibraryResource::getUrl());

    $response->assertForbidden();
});
