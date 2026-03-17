import type { KnowledgeDocument } from "@atlas-kb/schema";

const HAN_SEGMENT_PATTERN = /\p{Script=Han}+/gu;
const WORD_SEPARATOR_PATTERN = /[^\p{L}\p{N}]+/u;

function buildHanTokens(segment: string): string[] {
  const tokens = new Set<string>();
  const normalizedSegment = segment.trim();

  if (!normalizedSegment) {
    return [];
  }

  tokens.add(normalizedSegment);

  const maxWindow = Math.min(4, normalizedSegment.length);

  for (let size = maxWindow; size >= 2; size -= 1) {
    for (let index = 0; index <= normalizedSegment.length - size; index += 1) {
      tokens.add(normalizedSegment.slice(index, index + size));
    }
  }

  return [...tokens];
}

export function normalizeSearchTokens(input: string): string[] {
  const normalized = input.toLowerCase().trim();

  if (!normalized) {
    return [];
  }

  const wordTokens = normalized
    .split(WORD_SEPARATOR_PATTERN)
    .map((token) => token.trim())
    .filter(Boolean);
  const hanTokens = [...normalized.matchAll(HAN_SEGMENT_PATTERN)].flatMap(
    ([segment]) => buildHanTokens(segment),
  );

  return [...new Set([...wordTokens, ...hanTokens])].sort(
    (left, right) => right.length - left.length,
  );
}

export function buildSearchSnippet(
  content: string,
  query: string,
  fallback: string,
  options: {
    trailingContext?: number;
    leadingContext?: number;
  } = {},
): string {
  const tokens = normalizeSearchTokens(query);
  const normalizedContent = content.toLowerCase();
  const leadingContext = options.leadingContext ?? 56;
  const trailingContext = options.trailingContext ?? 104;

  for (const token of tokens) {
    const index = normalizedContent.indexOf(token);
    if (index < 0) {
      continue;
    }

    const start = Math.max(0, index - leadingContext);
    const end = Math.min(
      content.length,
      index + token.length + trailingContext,
    );
    return content.slice(start, end).trim();
  }

  return fallback;
}

export function buildKnowledgeDocumentDownloadPath(params: {
  documentId: string;
  spaceId: string;
}): string {
  return `/api/kb/spaces/${encodeURIComponent(params.spaceId)}/documents/${encodeURIComponent(params.documentId)}/download`;
}

export function getKnowledgeDocumentSourceMetadata(
  document: Pick<
    KnowledgeDocument,
    "id" | "spaceId" | "source" | "sourceFilename"
  >,
): {
  downloadUrl?: string;
  sourceFilename?: string;
} {
  return {
    downloadUrl:
      document.source === "upload"
        ? buildKnowledgeDocumentDownloadPath({
            documentId: document.id,
            spaceId: document.spaceId,
          })
        : undefined,
    sourceFilename: document.sourceFilename,
  };
}
