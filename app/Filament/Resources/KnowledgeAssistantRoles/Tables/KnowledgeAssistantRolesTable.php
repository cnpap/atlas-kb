<?php

namespace App\Filament\Resources\KnowledgeAssistantRoles\Tables;

use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class KnowledgeAssistantRolesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->label('角色名称')
                    ->searchable()
                    ->sortable(),
                IconColumn::make('is_default')
                    ->label('默认')
                    ->boolean()
                    ->alignCenter(),
                TextColumn::make('sort_order')
                    ->label('排序')
                    ->sortable(),
                TextColumn::make('style_prompt')
                    ->label('回复风格')
                    ->limit(48)
                    ->wrap(),
                TextColumn::make('updated_at')
                    ->label('更新时间')
                    ->dateTime('Y-m-d H:i:s')
                    ->sortable(),
            ])
            ->defaultSort('sort_order')
            ->filters([
                //
            ])
            ->recordActions([
                EditAction::make()
                    ->label('编辑'),
            ])
            ->toolbarActions([])
            ->emptyStateHeading('暂无知识角色')
            ->emptyStateDescription('创建内置角色后，Atlas KB 用户即可在所有资料文件夹中切换使用。');
    }
}
