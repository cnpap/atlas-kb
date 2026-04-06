<?php

namespace Database\Factories;

use App\Models\KnowledgeTemplate;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<KnowledgeTemplate>
 */
class KnowledgeTemplateFactory extends Factory
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
            'name' => fake()->unique()->words(2, true),
            'system_prompt' => '请根据模板字段补全结构化信息。',
            'template_type' => KnowledgeTemplate::TYPE_DOCX,
            'source_disk' => 'kb_templates',
            'source_path' => 'kb/templates/'.Str::uuid().'.docx',
            'source_filename' => 'template.docx',
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'byte_size' => 1024,
            'checksum_sha256' => hash('sha256', fake()->uuid()),
            'parse_status' => KnowledgeTemplate::PARSE_STATUS_PENDING,
            'parse_error' => null,
            'parser_version' => 'ooxml-v1',
            'is_active' => true,
            'parsed_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
