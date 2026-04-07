<?php

namespace App\Filament\Resources\KnowledgeTemplateExports;

use App\Filament\Resources\KnowledgeTemplateExports\Pages\ListKnowledgeTemplateExports;
use App\Filament\Resources\KnowledgeTemplateExports\Tables\KnowledgeTemplateExportsTable;
use App\Models\KnowledgeTemplateExport;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

class KnowledgeTemplateExportResource extends Resource
{
    protected static ?string $model = KnowledgeTemplateExport::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedArrowDownTray;

    protected static ?string $navigationLabel = '模板导出记录';

    protected static string|UnitEnum|null $navigationGroup = '知识库';

    protected static ?string $modelLabel = '模板导出记录';

    protected static ?string $pluralModelLabel = '模板导出记录';

    protected static ?string $recordTitleAttribute = 'output_filename';

    public static function form(Schema $schema): Schema
    {
        return $schema->components([]);
    }

    public static function table(Table $table): Table
    {
        return KnowledgeTemplateExportsTable::configure($table);
    }

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()
            ->with(['ownerUser', 'template']);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListKnowledgeTemplateExports::route('/'),
        ];
    }
}
