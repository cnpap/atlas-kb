import type { KnowledgeSource } from "@atlas-kb/schema";

const HAN_SEGMENT_PATTERN = /\p{Script=Han}+/gu;
const WORD_PATTERN = /[\p{L}\p{N}_-]+/gu;

export interface KnowledgeChunkCandidate {
  chunkId: string;
  chunkIndex: number;
  sectionPath?: string;
  text: string;
  title: string;
}

function buildHanTokens(segment: string): string[] {
  const tokens = new Set<string>();
  const normalized = segment.trim();

  if (!normalized) {
    return [];
  }

  tokens.add(normalized);

  for (let size = Math.min(4, normalized.length); size >= 2; size -= 1) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      tokens.add(normalized.slice(index, index + size));
    }
  }

  return [...tokens];
}

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function slugify(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "item";
}

export function normalizeSearchTokens(input: string): string[] {
  const normalized = input.toLowerCase().trim();

  if (!normalized) {
    return [];
  }

  const wordTokens = [...normalized.matchAll(WORD_PATTERN)]
    .map(([token]) => token.trim())
    .filter((token) => token.length > 1);
  const hanTokens = [...normalized.matchAll(HAN_SEGMENT_PATTERN)].flatMap(
    ([segment]) => buildHanTokens(segment),
  );

  return [...new Set([...wordTokens, ...hanTokens])].sort(
    (left, right) => right.length - left.length,
  );
}

export function buildLexicalIndexText(parts: string[]): string {
  const base = parts
    .map((part) => normalizeWhitespace(part).toLowerCase())
    .filter(Boolean)
    .join("\n");
  const tokens = normalizeSearchTokens(base);

  return [...new Set([...tokens, base])].join(" ");
}

export function buildLexicalSearchQuery(input: string): string {
  const tokens = normalizeSearchTokens(input);
  if (tokens.length === 0) {
    return "";
  }

  return tokens.map((token) => `"${token.replace(/"/g, "")}"`).join(" OR ");
}

export function buildSummary(content: string, maxLength = 220): string {
  const flattened = normalizeWhitespace(content).replace(/\n/g, " ");
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength - 3).trim()}...`
    : flattened;
}

export function buildContentPreview(content: string, maxLength = 280): string {
  return buildSummary(content, maxLength);
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
  const leadingContext = options.leadingContext ?? 72;
  const trailingContext = options.trailingContext ?? 144;

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

function splitIntoSections(content: string): Array<{
  body: string;
  title?: string;
}> {
  const normalized = normalizeWhitespace(content);

  if (!normalized) {
    return [];
  }

  const sections: Array<{ body: string; title?: string }> = [];
  let currentTitle: string | undefined;
  let currentBody: string[] = [];

  for (const line of normalized.split("\n")) {
    if (/^#{1,6}\s+/.test(line)) {
      if (currentBody.length > 0) {
        sections.push({
          body: currentBody.join("\n").trim(),
          title: currentTitle,
        });
        currentBody = [];
      }
      currentTitle = line.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }

    currentBody.push(line);
  }

  if (currentBody.length > 0) {
    sections.push({
      body: currentBody.join("\n").trim(),
      title: currentTitle,
    });
  }

  return sections.length > 0 ? sections : [{ body: normalized }];
}

export function chunkKnowledgeContent(params: {
  content: string;
  sourceId: string;
  title: string;
}): KnowledgeChunkCandidate[] {
  const MAX_CHUNK_SIZE = 900;
  const sections = splitIntoSections(params.content);
  const chunks: KnowledgeChunkCandidate[] = [];

  let chunkIndex = 0;

  for (const section of sections) {
    const paragraphBuffer: string[] = [];
    let currentLength = 0;

    for (const paragraph of section.body.split("\n\n")) {
      const normalizedParagraph = normalizeWhitespace(paragraph);
      if (!normalizedParagraph) {
        continue;
      }

      if (
        currentLength > 0 &&
        currentLength + normalizedParagraph.length > MAX_CHUNK_SIZE
      ) {
        const text = paragraphBuffer.join("\n\n").trim();
        if (text) {
          chunks.push({
            chunkId: `${params.sourceId}:chunk:${chunkIndex}`,
            chunkIndex,
            sectionPath: section.title,
            text,
            title: section.title || params.title,
          });
          chunkIndex += 1;
        }
        paragraphBuffer.length = 0;
        currentLength = 0;
      }

      paragraphBuffer.push(normalizedParagraph);
      currentLength += normalizedParagraph.length;
    }

    const text = paragraphBuffer.join("\n\n").trim();
    if (text) {
      chunks.push({
        chunkId: `${params.sourceId}:chunk:${chunkIndex}`,
        chunkIndex,
        sectionPath: section.title,
        text,
        title: section.title || params.title,
      });
      chunkIndex += 1;
    }
  }

  return chunks.length > 0
    ? chunks
    : [
        {
          chunkId: `${params.sourceId}:chunk:0`,
          chunkIndex: 0,
          text: normalizeWhitespace(params.content),
          title: params.title,
        },
      ];
}

export function buildKnowledgeSourceDownloadPath(sourceId: string): string {
  return `/api/kb/sources/${encodeURIComponent(sourceId)}/download`;
}

export function getKnowledgeSourceMetadata(
  source: Pick<
    KnowledgeSource,
    "id" | "sourceFilename" | "sourceUrl" | "sourceType"
  >,
): {
  downloadUrl?: string;
  sourceFilename?: string;
  sourceUrl?: string;
} {
  return {
    downloadUrl:
      source.sourceType === "file" || source.sourceType === "seed"
        ? buildKnowledgeSourceDownloadPath(source.id)
        : undefined,
    sourceFilename: source.sourceFilename,
    sourceUrl: source.sourceUrl,
  };
}
