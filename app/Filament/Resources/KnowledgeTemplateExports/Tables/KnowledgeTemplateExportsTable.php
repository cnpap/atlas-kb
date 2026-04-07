<?php

namespace App\Filament\Resources\KnowledgeTemplateExports\Tables;

use App\Models\KnowledgeTemplateExport;
use Filament\Actions\Action;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Support\Number;

class KnowledgeTemplateExportsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('output_filename')
                    ->label('导出文件')
                    ->searchable()
                    ->copyable(),
                TextColumn::make('template.name')
                    ->label('模板')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('ownerUser.name')
                    ->label('导出人')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('ownerUser.username')
                    ->label('用户名')
                    ->searchable()
                    ->copyable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('byte_size')
                    ->label('文件大小')
                    ->formatStateUsing(fn (int $state): string => Number::fileSize($state))
                    ->sortable(),
                TextColumn::make('mime_type')
                    ->label('类型')
                    ->badge()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('created_at')
                    ->label('导出时间')
                    ->dateTime('Y-m-d H:i:s')
                    ->sortable(),
                TextColumn::make('expires_at')
                    ->label('过期时间')
                    ->dateTime('Y-m-d H:i:s')
                    ->sortable(),
            ])
            ->filters([
                //
            ])
            ->recordActions([
                Action::make('downloadExport')
                    ->label('下载导出')
                    ->authorize('view')
                    ->url(fn (KnowledgeTemplateExport $record): string => $record->downloadUrl())
                    ->openUrlInNewTab(),
            ])
            ->toolbarActions([])
            ->defaultSort('created_at', 'desc')
            ->emptyStateHeading('暂无模板导出记录')
            ->emptyStateDescription('用户通过模板 API 发起导出后，这里会显示全部导出记录。');
    }
}
