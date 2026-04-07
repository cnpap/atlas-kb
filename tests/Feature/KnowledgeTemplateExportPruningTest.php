<?php

use App\Models\KnowledgeTemplateExport;
use Illuminate\Support\Facades\Storage;

test('expired template exports are pruned from storage and database', function () {
    Storage::fake('kb_templates');

    $expiredExport = KnowledgeTemplateExport::factory()->create([
        'output_disk' => 'kb_templates',
        'output_path' => 'kb/template-exports/tests/expired.docx',
        'expires_at' => now()->subDay(),
    ]);
    $freshExport = KnowledgeTemplateExport::factory()->create([
        'output_disk' => 'kb_templates',
        'output_path' => 'kb/template-exports/tests/fresh.docx',
        'expires_at' => now()->addDay(),
    ]);

    Storage::disk('kb_templates')->put($expiredExport->output_path, 'expired');
    Storage::disk('kb_templates')->put($freshExport->output_path, 'fresh');

    $this->artisan('knowledge-templates:prune-exports')->assertSuccessful();

    expect(KnowledgeTemplateExport::query()->whereKey($expiredExport->getKey())->exists())->toBeFalse()
        ->and(KnowledgeTemplateExport::query()->whereKey($freshExport->getKey())->exists())->toBeTrue();

    Storage::disk('kb_templates')->assertMissing($expiredExport->output_path);
    Storage::disk('kb_templates')->assertExists($freshExport->output_path);
});
