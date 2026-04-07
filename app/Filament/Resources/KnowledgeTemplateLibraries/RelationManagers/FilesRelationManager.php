<?php

namespace App\Filament\Resources\KnowledgeTemplateLibraries\RelationManagers;

use App\Models\KnowledgeTemplateLibrary;
use App\Models\KnowledgeTemplateLibraryFile;
use App\Support\KnowledgeTemplates\TemplateLibraryFileManager;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Forms\Components\FileUpload;
use Filament\Notifications\Notification;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Number;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;
use Throwable;

class FilesRelationManager extends RelationManager
{
    protected static string $relationship = 'files';

    protected static ?string $title = '资料文件';

    protected static ?string $modelLabel = '资料文件';

    protected static ?string $pluralModelLabel = '资料文件';

    public function form(Schema $schema): Schema
    {
        return $schema->components([]);
    }

    public function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('source_filename')
                    ->label('文件名')
                    ->searchable()
                    ->copyable(),
                TextColumn::make('mime_type')
                    ->label('类型')
                    ->badge()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('byte_size')
                    ->label('大小')
                    ->formatStateUsing(fn (int $state): string => Number::fileSize($state))
                    ->sortable(),
                TextColumn::make('created_at')
                    ->label('上传时间')
                    ->dateTime('Y-m-d H:i:s')
                    ->sortable(),
            ])
            ->headerActions([
                Action::make('uploadFiles')
                    ->label('上传文件')
                    ->schema([
                        FileUpload::make('files')
                            ->label('资料文件')
                            ->multiple()
                            ->required()
                            ->storeFiles(false)
                            ->previewable(false)
                            ->maxSize((int) config('knowledge-templates.reference_libraries.max_upload_kb'))
                            ->helperText('支持一次上传多个任意类型文件。'),
                    ])
                    ->modalHeading('上传资料文件')
                    ->modalSubmitActionLabel('开始上传')
                    ->action(function (array $data): void {
                        /** @var KnowledgeTemplateLibrary $library */
                        $library = $this->getOwnerRecord();
                        $uploads = collect($data['files'] ?? [])
                            ->filter(fn (mixed $file): bool => $file instanceof TemporaryUploadedFile)
                            ->values();

                        if ($uploads->isEmpty()) {
                            return;
                        }

                        $fileManager = app(TemplateLibraryFileManager::class);
                        $storedFiles = [];

                        try {
                            DB::transaction(function () use ($library, $uploads, $fileManager, &$storedFiles): void {
                                $uploads->each(function (TemporaryUploadedFile $upload) use ($library, $fileManager, &$storedFiles): void {
                                    $storedFile = $fileManager->storeUpload($upload, $library);
                                    $storedFiles[] = $storedFile;

                                    $library->files()->create($storedFile);
                                });
                            });
                        } catch (Throwable $throwable) {
                            collect($storedFiles)->each(function (array $storedFile) use ($fileManager): void {
                                $fileManager->deleteStoredFile($storedFile['source_disk'], $storedFile['source_path']);
                            });

                            throw $throwable;
                        }

                        Notification::make()
                            ->title(sprintf('已上传 %d 个资料文件。', $uploads->count()))
                            ->success()
                            ->send();
                    }),
            ])
            ->recordActions([
                Action::make('downloadFile')
                    ->label('下载')
                    ->url(fn (KnowledgeTemplateLibraryFile $record): string => route('admin.knowledge-template-library-files.download', $record)),
                DeleteAction::make()
                    ->label('删除')
                    ->modalHeading('删除资料文件')
                    ->modalSubmitActionLabel('确认删除'),
            ])
            ->toolbarActions([])
            ->defaultSort('created_at', 'desc')
            ->emptyStateHeading('暂无资料文件')
            ->emptyStateDescription('上传资料文件后，模板即可关联该资料库。');
    }
}
