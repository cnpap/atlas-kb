<?php

namespace Database\Factories;

use App\Models\KnowledgeUser;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<KnowledgeUser>
 */
class KnowledgeUserFactory extends Factory
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
            'username' => 'kb_'.fake()->unique()->regexify('[a-z0-9][a-z0-9._-]{5,15}'),
            'password_hash' => Hash::driver('argon2id')->make('atlas-kb-dev'),
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
