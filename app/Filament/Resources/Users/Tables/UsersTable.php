<?php

namespace App\Filament\Resources\Users\Tables;

use App\Models\User;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class UsersTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->label('姓名')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('email')
                    ->label('邮箱')
                    ->searchable()
                    ->sortable()
                    ->copyable(),
                TextColumn::make('roles_summary')
                    ->label('角色')
                    ->state(fn (User $record): string => $record->roles->pluck('name')->implode('、'))
                    ->badge()
                    ->placeholder('未分配'),
                IconColumn::make('email_verified_at')
                    ->label('邮箱已验证')
                    ->boolean()
                    ->state(fn (User $record): bool => filled($record->email_verified_at)),
                IconColumn::make('two_factor_confirmed_at')
                    ->label('双重验证')
                    ->boolean()
                    ->state(fn (User $record): bool => filled($record->two_factor_confirmed_at)),
                TextColumn::make('created_at')
                    ->label('创建时间')
                    ->dateTime('Y-m-d H:i:s')
                    ->sortable(),
            ])
            ->defaultSort('created_at', 'desc')
            ->filters([
                //
            ])
            ->recordActions([
                EditAction::make()
                    ->label('编辑'),
            ])
            ->toolbarActions([])
            ->emptyStateHeading('暂无管理员用户')
            ->emptyStateDescription('创建管理员用户后，这里会显示后台账号与角色。');
    }
}
