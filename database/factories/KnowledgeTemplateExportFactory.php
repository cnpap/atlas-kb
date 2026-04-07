<?php

namespace Database\Factories;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateExport;
use App\Models\KnowledgeUser;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<KnowledgeTemplateExport>
 */
class KnowledgeTemplateExportFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'id' => (string) Str::uuid(),
            'template_id' => KnowledgeTemplate::factory()->state([
                'parse_status' => KnowledgeTemplate::PARSE_STATUS_READY,
                'parsed_at' => now(),
            ]),
            'owner_user_id' => KnowledgeUser::factory(),
            'output_disk' => 'kb_templates',
            'output_path' => 'kb/template-exports/'.Str::uuid().'.docx',
            'output_filename' => 'template-export.docx',
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'byte_size' => 2048,
            'expires_at' => now()->addDays((int) config('knowledge-templates.exports.retention_days', 30)),
            'created_at' => now(),
        ];
    }
}
