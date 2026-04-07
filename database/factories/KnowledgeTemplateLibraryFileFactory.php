<?php

namespace Database\Factories;

use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeTemplateLibraryFile;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<KnowledgeTemplateLibraryFile>
 */
class KnowledgeTemplateLibraryFileFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $filename = fake()->slug().'.pdf';

        return [
            'id' => (string) Str::uuid(),
            'library_id' => KnowledgeTemplateLibrary::factory(),
            'source_disk' => 'kb_templates',
            'source_path' => 'libraries/'.Str::uuid().'/'.$filename,
            'source_filename' => $filename,
            'mime_type' => 'application/pdf',
            'byte_size' => fake()->numberBetween(1024, 1024 * 512),
            'checksum_sha256' => hash('sha256', fake()->uuid()),
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
