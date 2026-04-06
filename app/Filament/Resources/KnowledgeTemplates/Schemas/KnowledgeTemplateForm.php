<?php

namespace App\Filament\Resources\KnowledgeTemplates\Schemas;

use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use App\Models\KnowledgeTemplate;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class KnowledgeTemplateForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('模板信息')
                    ->columns(2)
                    ->components([
                        TextInput::make('name')
                            ->label('模板名称')
                            ->required()
                            ->maxLength(120)
                            ->columnSpanFull(),
                        Textarea::make('system_prompt')
                            ->label('系统级提示词')
                            ->rows(8)
                            ->maxLength(8000)
                            ->default('')
                            ->helperText('供后续知识库与任务链路复用的模板级提示词。')
                            ->columnSpanFull(),
                        Toggle::make('is_active')
                            ->label('启用模板')
                            ->default(true),
                    ]),
                Section::make('模板文件')
                    ->columns(2)
                    ->components([
                        FileUpload::make('template_upload')
                            ->label('模板文件')
                            ->required(fn (string $operation): bool => $operation === 'create')
                            ->acceptedFileTypes([
                                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            ])
                            ->maxSize(25 * 1024)
                            ->storeFiles(false)
                            ->previewable(false)
                            ->helperText('仅支持 docx 与 xlsx，系统会自动提取 {{field_name}} 或 {{中文字段}} 占位符。')
                            ->columnSpanFull(),
                        TextInput::make('source_filename')
                            ->label('当前文件')
                            ->disabled()
                            ->dehydrated(false)
                            ->visible(fn (?KnowledgeTemplate $record): bool => $record instanceof KnowledgeTemplate)
                            ->columnSpanFull(),
                        TextInput::make('template_type')
                            ->label('模板类型')
                            ->disabled()
                            ->dehydrated(false)
                            ->formatStateUsing(fn (?string $state): string => KnowledgeTemplateResource::getTemplateTypeLabel($state))
                            ->visible(fn (?KnowledgeTemplate $record): bool => $record instanceof KnowledgeTemplate),
                        TextInput::make('parse_status')
                            ->label('解析状态')
                            ->disabled()
                            ->dehydrated(false)
                            ->formatStateUsing(fn (?string $state): string => KnowledgeTemplateResource::getParseStatusLabel($state))
                            ->visible(fn (?KnowledgeTemplate $record): bool => $record instanceof KnowledgeTemplate),
                        Textarea::make('parse_error')
                            ->label('解析错误')
                            ->rows(4)
                            ->disabled()
                            ->dehydrated(false)
                            ->visible(fn (?KnowledgeTemplate $record): bool => $record instanceof KnowledgeTemplate && filled($record->parse_error))
                            ->columnSpanFull(),
                    ]),
            ]);
    }
}
