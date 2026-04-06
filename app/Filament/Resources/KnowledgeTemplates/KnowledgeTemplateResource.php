<?php

namespace App\Filament\Resources\KnowledgeTemplates;

use App\Filament\Resources\KnowledgeTemplates\Pages\CreateKnowledgeTemplate;
use App\Filament\Resources\KnowledgeTemplates\Pages\EditKnowledgeTemplate;
use App\Filament\Resources\KnowledgeTemplates\Pages\ListKnowledgeTemplates;
use App\Filament\Resources\KnowledgeTemplates\RelationManagers\FieldsRelationManager;
use App\Filament\Resources\KnowledgeTemplates\Schemas\KnowledgeTemplateForm;
use App\Filament\Resources\KnowledgeTemplates\Tables\KnowledgeTemplatesTable;
use App\Jobs\GenerateKnowledgeTemplateFieldDrafts;
use App\Jobs\ParseKnowledgeTemplate;
use App\Models\KnowledgeTemplate;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use Illuminate\Contracts\Queue\ShouldQueue;
use UnitEnum;

class KnowledgeTemplateResource extends Resource
{
    protected static ?string $model = KnowledgeTemplate::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleStack;

    protected static ?string $navigationLabel = '模板市场';

    protected static string|UnitEnum|null $navigationGroup = '知识库';

    protected static ?string $modelLabel = '模板';

    protected static ?string $pluralModelLabel = '模板市场';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return KnowledgeTemplateForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return KnowledgeTemplatesTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            FieldsRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListKnowledgeTemplates::route('/'),
            'create' => CreateKnowledgeTemplate::route('/create'),
            'edit' => EditKnowledgeTemplate::route('/{record}/edit'),
        ];
    }

    public static function makeDownloadAction(): Action
    {
        return Action::make('downloadTemplate')
            ->label('下载模板')
            ->authorize('view')
            ->url(fn (KnowledgeTemplate $record): string => route('admin.knowledge-templates.download', $record))
            ->visible(fn (KnowledgeTemplate $record): bool => filled($record->source_path));
    }

    public static function makeReparseAction(): Action
    {
        return static::makeTemplateQueueAction(
            name: 'reparseTemplate',
            label: '重新解析',
            job: ParseKnowledgeTemplate::class,
            successTitle: '模板已加入重新解析队列',
        );
    }

    public static function makeGenerateDraftsAction(): Action
    {
        return static::makeTemplateQueueAction(
            name: 'generateFieldDrafts',
            label: '重新生成字段草稿',
            job: GenerateKnowledgeTemplateFieldDrafts::class,
            successTitle: '字段草稿生成任务已入队',
        );
    }

    public static function getParseStatusLabel(?string $status): string
    {
        return match ($status) {
            KnowledgeTemplate::PARSE_STATUS_PENDING => '待解析',
            KnowledgeTemplate::PARSE_STATUS_PROCESSING => '解析中',
            KnowledgeTemplate::PARSE_STATUS_READY => '可用',
            KnowledgeTemplate::PARSE_STATUS_FAILED => '失败',
            default => '未知',
        };
    }

    public static function getParseStatusColor(?string $status): string
    {
        return match ($status) {
            KnowledgeTemplate::PARSE_STATUS_PENDING => 'gray',
            KnowledgeTemplate::PARSE_STATUS_PROCESSING => 'warning',
            KnowledgeTemplate::PARSE_STATUS_READY => 'success',
            KnowledgeTemplate::PARSE_STATUS_FAILED => 'danger',
            default => 'gray',
        };
    }

    public static function getTemplateTypeLabel(?string $templateType): string
    {
        return match ($templateType) {
            KnowledgeTemplate::TYPE_DOCX => 'Word',
            KnowledgeTemplate::TYPE_XLSX => 'Excel',
            default => '未知',
        };
    }

    /**
     * @param  class-string<ShouldQueue>  $job
     */
    protected static function makeTemplateQueueAction(
        string $name,
        string $label,
        string $job,
        string $successTitle,
    ): Action {
        return Action::make($name)
            ->label($label)
            ->authorize('update')
            ->requiresConfirmation()
            ->action(function (KnowledgeTemplate $record) use ($job, $successTitle): void {
                $job::dispatch($record->getKey(), $record->checksum_sha256)->afterCommit();

                Notification::make()
                    ->title($successTitle)
                    ->success()
                    ->send();
            });
    }
}
