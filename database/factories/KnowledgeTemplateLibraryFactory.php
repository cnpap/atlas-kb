<?php

namespace Database\Factories;

use App\Models\KnowledgeTemplateLibrary;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<KnowledgeTemplateLibrary>
 */
class KnowledgeTemplateLibraryFactory extends Factory
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
            'storage_prefix' => 'libraries/'.fake()->unique()->slug(2, '/'),
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
