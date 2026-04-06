<?php

namespace App\Filament\Resources\KnowledgeTemplates\RelationManagers;

use App\Models\KnowledgeTemplateField;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class FieldsRelationManager extends RelationManager
{
    protected static string $relationship = 'fields';

    protected static ?string $title = '字段定义';

    protected static ?string $modelLabel = '模板字段';

    protected static ?string $pluralModelLabel = '模板字段';

    public function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('字段名')
                    ->disabled()
                    ->dehydrated(false),
                TextInput::make('label')
                    ->label('字段标签')
                    ->required()
                    ->maxLength(120),
                Textarea::make('description')
                    ->label('字段说明')
                    ->rows(4)
                    ->maxLength(500),
            ]);
    }

    public function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('sort_order')
                    ->label('排序')
                    ->sortable(),
                TextColumn::make('name')
                    ->label('字段名')
                    ->searchable()
                    ->copyable(),
                TextColumn::make('label')
                    ->label('字段标签')
                    ->searchable(),
                TextColumn::make('description')
                    ->label('字段说明')
                    ->limit(40),
                TextColumn::make('meta_source')
                    ->label('来源')
                    ->badge()
                    ->formatStateUsing(fn (string $state): string => match ($state) {
                        KnowledgeTemplateField::META_SOURCE_DEFAULT => '默认',
                        KnowledgeTemplateField::META_SOURCE_AI => 'AI',
                        KnowledgeTemplateField::META_SOURCE_MANUAL => '人工',
                        default => '未知',
                    }),
                TextColumn::make('locations_json')
                    ->label('出现位置')
                    ->state(fn (KnowledgeTemplateField $record): int => count($record->locations_json ?? [])),
            ])
            ->headerActions([])
            ->recordActions([
                EditAction::make()
                    ->label('编辑')
                    ->modalHeading('编辑模板字段')
                    ->modalSubmitActionLabel('保存')
                    ->mutateDataUsing(fn (array $data): array => [
                        ...$data,
                        'meta_source' => KnowledgeTemplateField::META_SOURCE_MANUAL,
                    ]),
            ])
            ->toolbarActions([])
            ->emptyStateHeading('暂无字段定义')
            ->emptyStateDescription('模板解析完成后，这里会显示提取出的占位符字段。')
            ->defaultSort('sort_order');
    }
}
