<?php

namespace Database\Factories;

use App\Models\KnowledgeTemplate;
use App\Models\KnowledgeTemplateField;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<KnowledgeTemplateField>
 */
class KnowledgeTemplateFieldFactory extends Factory
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
            'template_id' => KnowledgeTemplate::factory(),
            'name' => fake()->unique()->regexify('[a-z][a-z0-9_]{4,16}'),
            'label' => fake()->words(2, true),
            'description' => fake()->sentence(),
            'meta_source' => KnowledgeTemplateField::META_SOURCE_AI,
            'sort_order' => fake()->numberBetween(1, 10),
            'locations_json' => [
                [
                    'kind' => 'docx',
                    'part' => 'word/document.xml',
                    'block' => '段落 1',
                    'excerpt' => '{{customer_name}}',
                ],
            ],
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
