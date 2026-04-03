<?php

namespace App\Filament\Resources\KnowledgeUsers;

use App\Filament\Resources\KnowledgeUsers\Pages\CreateKnowledgeUser;
use App\Filament\Resources\KnowledgeUsers\Pages\EditKnowledgeUser;
use App\Filament\Resources\KnowledgeUsers\Pages\ListKnowledgeUsers;
use App\Filament\Resources\KnowledgeUsers\Schemas\KnowledgeUserForm;
use App\Filament\Resources\KnowledgeUsers\Tables\KnowledgeUsersTable;
use App\Models\KnowledgeUser;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use UnitEnum;

class KnowledgeUserResource extends Resource
{
    protected static ?string $model = KnowledgeUser::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleStack;

    protected static ?string $navigationLabel = 'Knowledge Users';

    protected static string|UnitEnum|null $navigationGroup = 'Knowledge Base';

    protected static ?string $modelLabel = 'Knowledge User';

    protected static ?string $pluralModelLabel = 'Knowledge Users';

    protected static ?string $recordTitleAttribute = 'username';

    public static function form(Schema $schema): Schema
    {
        return KnowledgeUserForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return KnowledgeUsersTable::configure($table);
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
            'index' => ListKnowledgeUsers::route('/'),
            'create' => CreateKnowledgeUser::route('/create'),
            'edit' => EditKnowledgeUser::route('/{record}/edit'),
        ];
    }
}
