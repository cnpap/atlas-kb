<?php

namespace Database\Factories;

use App\Models\KnowledgeAssistantRole;
use App\Models\KnowledgeUser;
use App\Models\KnowledgeUserSetting;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<KnowledgeUserSetting>
 */
class KnowledgeUserSettingFactory extends Factory
{
    protected $model = KnowledgeUserSetting::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => KnowledgeUser::factory(),
            'active_assistant_role_id' => KnowledgeAssistantRole::factory()->builtin(),
        ];
    }
}
