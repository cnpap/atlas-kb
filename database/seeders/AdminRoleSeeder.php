<?php

namespace Database\Seeders;

use App\Support\AdminAuthorizationBootstrapper;
use Illuminate\Database\Seeder;

class AdminRoleSeeder extends Seeder
{
    public function run(): void
    {
        app(AdminAuthorizationBootstrapper::class)->bootstrap();
    }
}
