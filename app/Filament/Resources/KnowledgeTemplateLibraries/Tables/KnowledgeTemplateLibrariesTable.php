<?php

namespace App\Filament\Resources\KnowledgeTemplateLibraries\Tables;

use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class KnowledgeTemplateLibrariesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->label('资料库名称')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('storage_prefix')
                    ->label('存储前缀')
                    ->searchable()
                    ->copyable(),
                TextColumn::make('files_count')
                    ->label('文件数')
                    ->counts('files')
                    ->sortable(),
                TextColumn::make('templates_count')
                    ->label('模板数')
                    ->counts('templates')
                    ->sortable(),
                TextColumn::make('updated_at')
                    ->label('更新时间')
                    ->dateTime('Y-m-d H:i:s')
                    ->sortable(),
            ])
            ->filters([
                //
            ])
            ->recordActions([
                EditAction::make()
                    ->label('编辑'),
            ])
            ->toolbarActions([])
            ->defaultSort('updated_at', 'desc')
            ->emptyStateHeading('暂无模板资料库')
            ->emptyStateDescription('创建资料库并上传资料文件后，模板即可按需多选关联。');
    }
}
