<?php

namespace App\Filament\Resources\KnowledgeTemplateLibraries;

use App\Filament\Resources\KnowledgeTemplateLibraries\Pages\CreateKnowledgeTemplateLibrary;
use App\Filament\Resources\KnowledgeTemplateLibraries\Pages\EditKnowledgeTemplateLibrary;
use App\Filament\Resources\KnowledgeTemplateLibraries\Pages\ListKnowledgeTemplateLibraries;
use App\Filament\Resources\KnowledgeTemplateLibraries\RelationManagers\FilesRelationManager;
use App\Filament\Resources\KnowledgeTemplateLibraries\Schemas\KnowledgeTemplateLibraryForm;
use App\Filament\Resources\KnowledgeTemplateLibraries\Tables\KnowledgeTemplateLibrariesTable;
use App\Models\KnowledgeTemplateLibrary;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use UnitEnum;

class KnowledgeTemplateLibraryResource extends Resource
{
    protected static ?string $model = KnowledgeTemplateLibrary::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBookOpen;

    protected static ?string $navigationLabel = '模板资料库';

    protected static string|UnitEnum|null $navigationGroup = '知识库';

    protected static ?string $modelLabel = '模板资料库';

    protected static ?string $pluralModelLabel = '模板资料库';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return KnowledgeTemplateLibraryForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return KnowledgeTemplateLibrariesTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            FilesRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListKnowledgeTemplateLibraries::route('/'),
            'create' => CreateKnowledgeTemplateLibrary::route('/create'),
            'edit' => EditKnowledgeTemplateLibrary::route('/{record}/edit'),
        ];
    }
}
