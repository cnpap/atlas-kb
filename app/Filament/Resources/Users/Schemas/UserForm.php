<?php

namespace App\Filament\Resources\Users\Schemas;

use App\Support\AdminRoles;
use Filament\Forms\Components\CheckboxList;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Schema;
use Illuminate\Validation\Rules\Password;

class UserForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Grid::make(2)
                    ->schema([
                        TextInput::make('name')
                            ->label('姓名')
                            ->required()
                            ->maxLength(255),
                        TextInput::make('email')
                            ->label('邮箱')
                            ->email()
                            ->required()
                            ->maxLength(255)
                            ->unique(ignoreRecord: true),
                        TextInput::make('password')
                            ->label('密码')
                            ->password()
                            ->revealable()
                            ->required(fn (string $operation): bool => $operation === 'create')
                            ->rule(Password::default())
                            ->dehydrated(fn (?string $state): bool => filled($state))
                            ->autocomplete(fn (string $operation): string => $operation === 'create' ? 'new-password' : 'off')
                            ->helperText('编辑时留空表示保留当前密码。')
                            ->columnSpanFull(),
                        CheckboxList::make('role_names')
                            ->label('角色')
                            ->options(AdminRoles::options())
                            ->required()
                            ->columns(3)
                            ->columnSpanFull(),
                    ]),
            ]);
    }
}
