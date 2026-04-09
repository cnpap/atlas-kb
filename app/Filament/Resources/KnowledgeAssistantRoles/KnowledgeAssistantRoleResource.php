<?php

namespace App\Filament\Resources\KnowledgeAssistantRoles;

use App\Filament\Resources\KnowledgeAssistantRoles\Pages\CreateKnowledgeAssistantRole;
use App\Filament\Resources\KnowledgeAssistantRoles\Pages\EditKnowledgeAssistantRole;
use App\Filament\Resources\KnowledgeAssistantRoles\Pages\ListKnowledgeAssistantRoles;
use App\Filament\Resources\KnowledgeAssistantRoles\Schemas\KnowledgeAssistantRoleForm;
use App\Filament\Resources\KnowledgeAssistantRoles\Tables\KnowledgeAssistantRolesTable;
use App\Models\KnowledgeAssistantRole;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

class KnowledgeAssistantRoleResource extends Resource
{
    protected static ?string $model = KnowledgeAssistantRole::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleStack;

    protected static ?string $navigationLabel = '知识角色';

    protected static string|UnitEnum|null $navigationGroup = '知识库';

    protected static ?string $modelLabel = '角色';

    protected static ?string $pluralModelLabel = '知识角色';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return KnowledgeAssistantRoleForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return KnowledgeAssistantRolesTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()
            ->where('is_builtin', true)
            ->orderBy('sort_order')
            ->orderByDesc('updated_at');
    }

    public static function getPages(): array
    {
        return [
            'index' => ListKnowledgeAssistantRoles::route('/'),
            'create' => CreateKnowledgeAssistantRole::route('/create'),
            'edit' => EditKnowledgeAssistantRole::route('/{record}/edit'),
        ];
    }
}
