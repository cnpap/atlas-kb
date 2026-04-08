const HAN_SEGMENT_PATTERN = /\p{Script=Han}+/gu;
const WORD_PATTERN = /[\p{L}\p{N}_-]+/gu;

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

function normalizeSearchTokens(input: string): string[] {
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

export function buildSummary(content: string, maxLength = 220): string {
  const flattened = normalizeWhitespace(content).replace(/\n/g, " ");
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength - 3).trim()}...`
    : flattened;
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
