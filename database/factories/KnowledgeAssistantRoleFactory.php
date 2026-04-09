<?php

namespace Database\Factories;

use App\Models\KnowledgeAssistantRole;
use App\Models\KnowledgeUser;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<KnowledgeAssistantRole>
 */
class KnowledgeAssistantRoleFactory extends Factory
{
    protected $model = KnowledgeAssistantRole::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'id' => (string) fake()->uuid(),
            'owner_user_id' => null,
            'name' => fake()->unique()->words(2, true),
            'system_prompt' => fake()->paragraph(),
            'style_prompt' => fake()->sentence(),
            'is_builtin' => true,
            'is_default' => false,
            'sort_order' => fake()->numberBetween(0, 20),
        ];
    }

    public function builtin(): static
    {
        return $this->state(fn (): array => [
            'owner_user_id' => null,
            'is_builtin' => true,
            'is_default' => false,
        ]);
    }

    public function defaultRole(): static
    {
        return $this->state(fn (): array => [
            'owner_user_id' => null,
            'is_builtin' => true,
            'is_default' => true,
        ]);
    }

    public function privateRole(?KnowledgeUser $user = null): static
    {
        return $this->state(fn (): array => [
            'owner_user_id' => $user?->getKey() ?? KnowledgeUser::factory(),
            'is_builtin' => false,
            'is_default' => false,
        ]);
    }
}
