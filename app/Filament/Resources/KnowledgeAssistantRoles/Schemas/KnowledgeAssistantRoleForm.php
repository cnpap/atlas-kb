<?php

namespace App\Filament\Resources\KnowledgeAssistantRoles\Schemas;

use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class KnowledgeAssistantRoleForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Grid::make([
                    'default' => 1,
                    'xl' => 12,
                ])
                    ->schema([
                        Section::make('基础信息')
                            ->schema([
                                Grid::make([
                                    'default' => 1,
                                    'lg' => 6,
                                ])
                                    ->schema([
                                        TextInput::make('name')
                                            ->label('角色名称')
                                            ->required()
                                            ->maxLength(120)
                                            ->columnSpan([
                                                'default' => 1,
                                                'lg' => 5,
                                            ]),
                                        Toggle::make('is_default')
                                            ->label('设为默认角色')
                                            ->inline(false)
                                            ->columnSpan([
                                                'default' => 1,
                                                'lg' => 1,
                                            ]),
                                    ]),
                            ])
                            ->columnSpan([
                                'default' => 1,
                                'xl' => 4,
                            ]),
                        Section::make('系统提示词')
                            ->schema([
                                Textarea::make('system_prompt')
                                    ->label('系统提示词')
                                    ->rows(16)
                                    ->maxLength(8000)
                                    ->default('')
                                    ->helperText('定义角色职责、工作偏好和额外行为，不要覆盖知识库底层约束。')
                                    ->columnSpanFull(),
                            ])
                            ->columnSpan([
                                'default' => 1,
                                'xl' => 4,
                            ]),
                        Section::make('风格提示词')
                            ->schema([
                                Textarea::make('style_prompt')
                                    ->label('风格提示词')
                                    ->rows(16)
                                    ->maxLength(4000)
                                    ->default('')
                                    ->helperText('控制语气、结构和表达习惯。')
                                    ->columnSpanFull(),
                            ])
                            ->columnSpan([
                                'default' => 1,
                                'xl' => 4,
                            ]),
                    ])
                    ->columnSpanFull(),
            ]);
    }
}
