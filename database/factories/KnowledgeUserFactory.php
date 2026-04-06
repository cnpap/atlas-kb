<?php

namespace Database\Factories;

use App\Models\KnowledgeUser;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<KnowledgeUser>
 */
class KnowledgeUserFactory extends Factory
{
    protected $model = KnowledgeUser::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $username = 'kb_'.fake()->unique()->regexify('[a-z0-9][a-z0-9._-]{5,15}');

        return [
            'name' => $username,
            'username' => $username,
            'email' => null,
            'password' => 'atlas-kb-dev',
        ];
    }
}
