<?php

namespace Database\Seeders;

use App\Models\KnowledgeUser;
use Illuminate\Database\Seeder;

class KnowledgeUserSeeder extends Seeder
{
    public function run(): void
    {
        $username = KnowledgeUser::normalizeUsername(
            env('ATLAS_KB_DEFAULT_USERNAME', 'admin'),
        );

        $knowledgeUser = KnowledgeUser::query()
            ->where('username', $username)
            ->first();

        if ($knowledgeUser instanceof KnowledgeUser) {
            return;
        }

        KnowledgeUser::query()->create([
            'name' => $username,
            'username' => $username,
            'email' => null,
            'password' => (string) env('ATLAS_KB_DEFAULT_PASSWORD', 'atlas-kb-dev'),
        ]);
    }
}
