<?php

namespace App\Filament\Resources\KnowledgeUsers\Schemas;

use App\Models\KnowledgeUser;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Illuminate\Validation\Rules\Password;

class KnowledgeUserForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make()
                    ->columns(2)
                    ->components([
                        TextInput::make('username')
                            ->label('用户名')
                            ->required()
                            ->minLength(3)
                            ->maxLength(64)
                            ->regex(KnowledgeUser::USERNAME_PATTERN)
                            ->unique(ignoreRecord: true)
                            ->helperText('长度 3 到 64 位，仅支持小写字母、数字、点、下划线和中划线。')
                            ->dehydrateStateUsing(
                                fn (string $state): string => KnowledgeUser::normalizeUsername($state),
                            )
                            ->autocomplete(false)
                            ->columnSpanFull(),
                        TextInput::make('password')
                            ->label('密码')
                            ->password()
                            ->revealable()
                            ->required(fn (string $operation): bool => $operation === 'create')
                            ->rule(Password::default())
                            ->autocomplete(fn (string $operation): string => $operation === 'create' ? 'new-password' : 'off')
                            ->helperText('编辑时留空表示保留当前密码。')
                            ->columnSpanFull(),
                    ]),
            ]);
    }
}
