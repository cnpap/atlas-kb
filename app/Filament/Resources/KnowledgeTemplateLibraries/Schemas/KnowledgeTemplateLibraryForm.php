<?php

namespace App\Filament\Resources\KnowledgeTemplateLibraries\Schemas;

use App\Models\KnowledgeTemplateLibrary;
use Closure;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Schema;

class KnowledgeTemplateLibraryForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Grid::make(2)
                    ->schema([
                        TextInput::make('name')
                            ->label('资料库名称')
                            ->required()
                            ->maxLength(120)
                            ->columnSpanFull(),
                        TextInput::make('storage_prefix')
                            ->label('存储前缀')
                            ->required()
                            ->maxLength(255)
                            ->dehydrateStateUsing(
                                fn (string $state): string => KnowledgeTemplateLibrary::normalizeStoragePrefix($state),
                            )
                            ->rule(function (?KnowledgeTemplateLibrary $record): Closure {
                                return function (string $attribute, mixed $value, Closure $fail) use ($record): void {
                                    $normalized = KnowledgeTemplateLibrary::normalizeStoragePrefix((string) $value);

                                    if (! KnowledgeTemplateLibrary::isValidStoragePrefix($normalized)) {
                                        $fail('存储前缀仅支持多级路径，路径段只能包含小写字母、数字、下划线和中划线。');

                                        return;
                                    }

                                    $query = KnowledgeTemplateLibrary::query()
                                        ->where('storage_prefix', $normalized);

                                    if ($record instanceof KnowledgeTemplateLibrary) {
                                        $query->whereKeyNot($record->getKey());
                                    }

                                    if ($query->exists()) {
                                        $fail('存储前缀已存在。');
                                    }
                                };
                            })
                            ->helperText('保存时会自动转为小写，例如 ops/manuals。')
                            ->columnSpanFull(),
                    ]),
            ]);
    }
}
