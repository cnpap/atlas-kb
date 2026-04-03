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
                            ->label('Username')
                            ->required()
                            ->minLength(3)
                            ->maxLength(64)
                            ->regex(KnowledgeUser::USERNAME_PATTERN)
                            ->unique(ignoreRecord: true)
                            ->helperText('3-64 chars. Lowercase letters, numbers, dots, underscores, and hyphens only.')
                            ->dehydrateStateUsing(
                                fn (string $state): string => KnowledgeUser::normalizeUsername($state),
                            )
                            ->autocomplete(false)
                            ->columnSpanFull(),
                        TextInput::make('password')
                            ->label('Password')
                            ->password()
                            ->revealable()
                            ->required(fn (string $operation): bool => $operation === 'create')
                            ->rule(Password::default())
                            ->autocomplete(fn (string $operation): string => $operation === 'create' ? 'new-password' : 'off')
                            ->helperText('Leave blank while editing to keep the current password.')
                            ->columnSpanFull(),
                    ]),
            ]);
    }
}
