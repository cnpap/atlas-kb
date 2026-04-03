<?php

namespace Database\Seeders;

use App\Support\BootstrapAdminAccount;
use Illuminate\Database\Seeder;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        app(BootstrapAdminAccount::class)->bootstrap();
    }
}
