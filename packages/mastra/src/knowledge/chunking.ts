import { createHash } from "node:crypto";
import { splitByTokens } from "tokenx";

export const KNOWLEDGE_CHUNK_SIZE = 1500;
export const KNOWLEDGE_CHUNK_OVERLAP = 200;

export function buildKnowledgeChunks(text: string): string[] {
  return splitByTokens(text, KNOWLEDGE_CHUNK_SIZE, {
    overlap: KNOWLEDGE_CHUNK_OVERLAP,
  })
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function formatUuidFromHex(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildDeterministicUuid(seed: string): string {
  const bytes = createHash("sha1").update(seed).digest().subarray(0, 16);

  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  return formatUuidFromHex(Buffer.from(bytes).toString("hex"));
}

export function buildKnowledgeChunkId(
  sourceId: string,
  ordinal: number,
): string {
  return buildDeterministicUuid(`atlas-kb:${sourceId}:chunk:${ordinal}`);
}

export function buildKnowledgeChunkRef(
  sourceId: string,
  ordinal: number,
): string {
  return `${sourceId}#chunk:${ordinal}`;
}
