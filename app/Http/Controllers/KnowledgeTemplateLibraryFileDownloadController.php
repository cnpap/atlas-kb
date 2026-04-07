<?php

namespace App\Http\Controllers;

use App\Models\KnowledgeTemplateLibraryFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class KnowledgeTemplateLibraryFileDownloadController extends Controller
{
    public function __invoke(KnowledgeTemplateLibraryFile $knowledgeTemplateLibraryFile): StreamedResponse
    {
        $this->authorize('view', $knowledgeTemplateLibraryFile->library);

        return Storage::disk($knowledgeTemplateLibraryFile->source_disk)->download(
            $knowledgeTemplateLibraryFile->source_path,
            $knowledgeTemplateLibraryFile->source_filename,
            ['Content-Type' => $knowledgeTemplateLibraryFile->mime_type],
        );
    }
}
