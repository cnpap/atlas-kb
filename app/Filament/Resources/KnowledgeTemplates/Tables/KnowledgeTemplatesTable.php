<?php

namespace App\Filament\Resources\KnowledgeTemplates\Tables;

use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;

class KnowledgeTemplatesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->label('模板名称')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('template_type')
                    ->label('类型')
                    ->badge()
                    ->formatStateUsing(fn (?string $state): string => KnowledgeTemplateResource::getTemplateTypeLabel($state))
                    ->sortable(),
                TextColumn::make('parse_status')
                    ->label('解析状态')
                    ->badge()
                    ->formatStateUsing(fn (?string $state): string => KnowledgeTemplateResource::getParseStatusLabel($state))
                    ->color(fn (?string $state): string => KnowledgeTemplateResource::getParseStatusColor($state))
                    ->sortable(),
                TextColumn::make('fields_count')
                    ->label('字段数')
                    ->counts('fields')
                    ->sortable(),
                IconColumn::make('is_active')
                    ->label('启用')
                    ->boolean()
                    ->sortable(),
                TextColumn::make('updated_at')
                    ->label('更新时间')
                    ->dateTime('Y-m-d H:i:s')
                    ->sortable(),
            ])
            ->filters([
                SelectFilter::make('parse_status')
                    ->label('解析状态')
                    ->options([
                        'pending' => '待解析',
                        'processing' => '解析中',
                        'ready' => '可用',
                        'failed' => '失败',
                    ]),
                TernaryFilter::make('is_active')
                    ->label('启用状态'),
            ])
            ->recordActions([
                KnowledgeTemplateResource::makeDownloadAction(),
                KnowledgeTemplateResource::makeReparseAction(),
                KnowledgeTemplateResource::makeGenerateDraftsAction(),
                EditAction::make()
                    ->label('编辑'),
            ])
            ->toolbarActions([])
            ->emptyStateHeading('暂无模板')
            ->emptyStateDescription('上传 docx 或 xlsx 模板后，这里会显示模板列表与解析状态。')
            ->defaultSort('updated_at', 'desc');
    }
}
