<?php

namespace App\Filament\Resources\KnowledgeTemplates\Schemas;

use App\Filament\Resources\KnowledgeTemplates\KnowledgeTemplateResource;
use App\Models\KnowledgeTemplate;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\MarkdownEditor;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Components\Group;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Illuminate\Database\Eloquent\Builder;

class KnowledgeTemplateForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->columns(1)
            ->components([
                Grid::make([
                    'default' => 1,
                    'xl' => 12,
                ])
                    ->schema([
                        Group::make()
                            ->schema(fn (string $operation): array => static::leftColumnSections($operation))
                            ->columnSpan([
                                'default' => 1,
                                'xl' => 5,
                            ]),
                        Group::make([
                            static::promptSection(),
                        ])
                            ->columnSpan([
                                'default' => 1,
                                'xl' => 7,
                            ]),
                    ])
                    ->columnSpanFull(),
            ]);
    }

    protected static function leftColumnSections(string $operation): array
    {
        return match ($operation) {
            'create' => [
                static::baseInfoSection(),
                static::assignmentSection(),
                static::fileSection(),
            ],
            default => [
                static::baseInfoSection(),
                static::fileSection(),
                static::assignmentSection(),
            ],
        };
    }

    protected static function baseInfoSection(): Section
    {
        return Section::make('基础信息')
            ->icon(Heroicon::OutlinedPencilSquare)
            ->schema([
                Grid::make([
                    'default' => 1,
                    'lg' => 4,
                ])
                    ->schema([
                        TextInput::make('name')
                            ->label('模板名称')
                            ->required()
                            ->maxLength(120)
                            ->columnSpan([
                                'default' => 1,
                                'lg' => 3,
                            ]),
                        Toggle::make('is_active')
                            ->label('启用模板')
                            ->default(true)
                            ->inline(false)
                            ->columnSpan([
                                'default' => 1,
                                'lg' => 1,
                            ]),
                    ]),
            ]);
    }

    protected static function promptSection(): Section
    {
        return Section::make('系统级提示词')
            ->icon(Heroicon::OutlinedChatBubbleLeftRight)
            ->schema([
                MarkdownEditor::make('system_prompt')
                    ->label('系统级提示词')
                    ->helperText('支持 Markdown，建议使用标题、列表和代码块组织提示词。')
                    ->toolbarButtons([
                        ['bold', 'italic', 'strike'],
                        ['heading'],
                        ['blockquote', 'codeBlock'],
                        ['bulletList', 'orderedList'],
                        ['undo', 'redo'],
                    ])
                    ->minHeight('24rem')
                    ->maxHeight('48rem')
                    ->extraAttributes([
                        'style' => 'min-height: 24rem;',
                    ])
                    ->maxLength(8000)
                    ->default('')
                    ->columnSpanFull(),
            ]);
    }

    protected static function fileSection(): Section
    {
        return Section::make('模板文件')
            ->icon(Heroicon::OutlinedDocumentArrowUp)
            ->schema([
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
            ]);
    }

    protected static function assignmentSection(): Section
    {
        return Section::make('分配与资料')
            ->icon(Heroicon::OutlinedUsers)
            ->schema([
                Select::make('assignedKnowledgeUsers')
                    ->label('可用用户')
                    ->multiple()
                    ->relationship(
                        titleAttribute: 'username',
                        modifyQueryUsing: fn (Builder $query): Builder => $query->orderBy('username'),
                    )
                    ->searchable()
                    ->preload()
                    ->columnSpanFull(),
                Select::make('referenceLibraries')
                    ->label('关联资料库')
                    ->multiple()
                    ->relationship(
                        titleAttribute: 'name',
                        modifyQueryUsing: fn (Builder $query): Builder => $query->orderBy('name'),
                    )
                    ->searchable()
                    ->preload()
                    ->columnSpanFull(),
            ]);
    }
}
