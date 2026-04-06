<?php

namespace App\Http\Controllers;

use App\Models\KnowledgeTemplate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class KnowledgeTemplateDownloadController extends Controller
{
    /**
     * Handle the incoming request.
     */
    public function __invoke(KnowledgeTemplate $knowledgeTemplate): StreamedResponse
    {
        abort_unless(filled($knowledgeTemplate->source_path), 404);

        return Storage::disk($knowledgeTemplate->source_disk)->download(
            $knowledgeTemplate->source_path,
            $knowledgeTemplate->source_filename,
            [
                'Content-Type' => $knowledgeTemplate->mime_type,
            ],
        );
    }
}
