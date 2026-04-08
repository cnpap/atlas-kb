import { BadRequestError } from "@atlas-kb/errors";
import type {
  AskKnowledgeCitation,
  SearchKnowledgeHit,
  SearchKnowledgeRequest,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import { SearchKnowledgeRequestSchema } from "@atlas-kb/schema";
import { listKnowledgeSources, requireKnowledgeCollection } from "./repository";
import { getKnowledgeWorkspace, toVectorPointId } from "./runtime";
import { buildSearchSnippet } from "./search-utils";

const DEFAULT_SEARCH_LIMIT = 8;

function requireCollectionId(input: SearchKnowledgeRequest): string {
  const collectionId = input.collectionId?.trim();

  if (!collectionId) {
    throw new BadRequestError("`collectionId` 为必填项");
  }

  return collectionId;
}

function filterSources(
  sources: Awaited<ReturnType<typeof listKnowledgeSources>>,
  input: SearchKnowledgeRequest,
) {
  return sources.filter((source) => {
    if (source.status !== "ready") {
      return Boolean(input.includeArchived && source.status === "archived");
    }

    if (
      input.sourceTypes?.length &&
      !input.sourceTypes.includes(source.sourceType)
    ) {
      return false;
    }

    if (
      input.tags?.length &&
      !input.tags.every((tag) => source.tags.includes(tag))
    ) {
      return false;
    }

    return true;
  });
}

function buildSectionPath(result: {
  lineRange?: {
    start: number;
    end: number;
  };
}) {
  if (!result.lineRange) {
    return undefined;
  }

  const { start, end } = result.lineRange;
  return start === end ? `第 ${start} 行` : `第 ${start}-${end} 行`;
}

function buildChunkId(result: {
  documentId: string;
  lineRange?: {
    start: number;
    end: number;
  };
}) {
  if (!result.lineRange) {
    return `${result.documentId}#chunk:0`;
  }

  return `${result.documentId}#L${result.lineRange.start}-${result.lineRange.end}`;
}

function toSearchEngine(
  workspace: Awaited<ReturnType<typeof getKnowledgeWorkspace>>,
) {
  if (workspace.canHybrid) {
    return "hybrid" as const;
  }

  if (workspace.canVector) {
    return "vector" as const;
  }

  return "lexical" as const;
}

function toSearchHit(args: {
  engine: SearchKnowledgeResult["engine"];
  query: string;
  result: {
    content: string;
    lineRange?: {
      start: number;
      end: number;
    };
    score: number;
  };
  source: Awaited<ReturnType<typeof listKnowledgeSources>>[number];
}): SearchKnowledgeHit {
  return {
    sourceId: args.source.id,
    documentId: args.source.documentId || args.source.id,
    collectionId: args.source.collectionId,
    chunkId: buildChunkId({
      documentId: args.source.documentId || args.source.id,
      lineRange: args.result.lineRange,
    }),
    title: args.source.title,
    summary: args.source.summary,
    snippet: buildSearchSnippet(
      args.result.content,
      args.query,
      args.source.summary,
    ),
    sectionPath: buildSectionPath(args.result),
    sourceFilename: args.source.sourceFilename,
    sourceType: args.source.sourceType,
    tags: [...args.source.tags],
    score: args.result.score,
    strategy:
      args.engine === "hybrid"
        ? "fusion"
        : args.engine === "vector"
          ? "vector"
          : "lexical",
    usedInAnswer: false,
    recallPaths:
      args.engine === "hybrid"
        ? ["关键词召回", "语义召回"]
        : args.engine === "vector"
          ? ["语义召回"]
          : ["关键词召回"],
  };
}

export function toCitation(hit: SearchKnowledgeHit): AskKnowledgeCitation {
  return {
    sourceId: hit.sourceId,
    documentId: hit.documentId,
    collectionId: hit.collectionId,
    title: hit.title,
    sectionPath: hit.sectionPath,
    snippet: hit.snippet,
    sourceFilename: hit.sourceFilename,
    downloadUrl: hit.downloadUrl,
    sourceType: hit.sourceType,
  };
}

export function annotateAnswerUsage(
  search: SearchKnowledgeResult,
  limit: number,
): SearchKnowledgeResult {
  const usedHitIds = search.hits.slice(0, limit).map((hit) => hit.chunkId);
  const usedSet = new Set(usedHitIds);

  return {
    ...search,
    usedHitIds,
    hits: search.hits.map((hit) => ({
      ...hit,
      usedInAnswer: usedSet.has(hit.chunkId),
    })),
  };
}

export async function searchKnowledge(
  input: SearchKnowledgeRequest,
  options: {
    userId: string;
  },
): Promise<SearchKnowledgeResult> {
  const parsedInput = SearchKnowledgeRequestSchema.parse(input);
  const collectionId = requireCollectionId(parsedInput);
  const limit = parsedInput.limit ?? DEFAULT_SEARCH_LIMIT;

  await requireKnowledgeCollection(options.userId, collectionId);

  const [workspace, sources] = await Promise.all([
    getKnowledgeWorkspace({
      userId: options.userId,
      collectionId,
    }),
    listKnowledgeSources(options.userId, collectionId),
  ]);
  const filteredSources = filterSources(sources, parsedInput);
  const sourceMap = new Map(
    filteredSources.flatMap((source) => {
      const documentId = source.documentId || source.id;

      return [
        [documentId, source] as const,
        [toVectorPointId(documentId), source] as const,
      ];
    }),
  );
  const engine = toSearchEngine(workspace);
  const results = await workspace.search(parsedInput.query, {
    topK: limit,
    mode:
      engine === "hybrid" ? "hybrid" : engine === "vector" ? "vector" : "bm25",
  });
  const hits = results
    .map((result) => {
      const source = sourceMap.get(result.id);

      if (!source) {
        return undefined;
      }

      return toSearchHit({
        engine,
        query: parsedInput.query,
        result: {
          content: result.content,
          lineRange: result.lineRange,
          score: result.score,
        },
        source,
      });
    })
    .filter((hit): hit is SearchKnowledgeHit => Boolean(hit));

  return {
    query: parsedInput.query,
    rewrittenQueries: [],
    queryVariants: [parsedInput.query],
    engine,
    total: hits.length,
    usedHitIds: [],
    hits,
  };
}
