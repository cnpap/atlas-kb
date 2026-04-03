<?php

namespace Database\Seeders;

use App\Models\KnowledgeUser;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

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
            'username' => $username,
            'password_hash' => Hash::driver('argon2id')->make(
                (string) env('ATLAS_KB_DEFAULT_PASSWORD', 'atlas-kb-dev'),
            ),
        ]);
    }
}
