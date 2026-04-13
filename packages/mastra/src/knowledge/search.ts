import { BadRequestError } from "@atlas-kb/errors";
import type {
  SearchKnowledgeHit,
  SearchKnowledgeRequest,
  SearchKnowledgeResult,
} from "@atlas-kb/schema";
import { SearchKnowledgeRequestSchema } from "@atlas-kb/schema";
import { listKnowledgeSources, requireKnowledgeCollection } from "./repository";
import { getKnowledgeWorkspace } from "./runtime";
import { buildSearchSnippet } from "./search-utils";

const DEFAULT_SEARCH_LIMIT = 8;

type WorkspaceSearchResult = {
  content: string;
  id: string;
  lineRange?: {
    end: number;
    start: number;
  };
  metadata?: {
    chunkId?: string;
    pageNumbers?: number[];
    path?: string;
  };
  score: number;
};

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

    return true;
  });
}

function normalizePageNumbers(pageNumbers?: number[]): number[] {
  return [...new Set((pageNumbers ?? []).filter((value) => value > 0))].sort(
    (left, right) => left - right,
  );
}

function buildSectionPath(result: {
  lineRange?: {
    start: number;
    end: number;
  };
  metadata?: {
    pageNumbers?: number[];
  };
}) {
  const pageNumbers = normalizePageNumbers(result.metadata?.pageNumbers);

  if (pageNumbers.length > 0) {
    return pageNumbers.length === 1
      ? `第 ${pageNumbers[0]} 页`
      : `第 ${pageNumbers.join("、")} 页`;
  }

  if (!result.lineRange) {
    return undefined;
  }

  const { start, end } = result.lineRange;
  return start === end ? `第 ${start} 行` : `第 ${start}-${end} 行`;
}

function buildChunkId(result: {
  documentId: string;
  id: string;
  lineRange?: {
    start: number;
    end: number;
  };
  metadata?: {
    chunkId?: string;
  };
}) {
  const chunkId = result.metadata?.chunkId?.trim();

  if (chunkId) {
    return chunkId;
  }

  if (result.id.trim()) {
    return result.id;
  }

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
  result: WorkspaceSearchResult;
  source: Awaited<ReturnType<typeof listKnowledgeSources>>[number];
}): SearchKnowledgeHit {
  return {
    sourceId: args.source.id,
    documentId: args.source.documentId || args.source.id,
    collectionId: args.source.collectionId,
    chunkId: buildChunkId({
      documentId: args.source.documentId || args.source.id,
      id: args.result.id,
      lineRange: args.result.lineRange,
      metadata: args.result.metadata,
    }),
    sourceFilename:
      args.source.sourceFilename || args.source.documentId || args.source.id,
    snippet: buildSearchSnippet(
      args.result.content,
      args.query,
      args.source.sourceFilename || args.source.documentId || args.source.id,
    ),
    sectionPath: buildSectionPath({
      lineRange: args.result.lineRange,
      metadata: args.result.metadata,
    }),
    sourceType: args.source.sourceType,
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
  const sourceMap = new Map<string, (typeof filteredSources)[number]>();

  for (const source of filteredSources) {
    if (source.documentId) {
      sourceMap.set(source.documentId, source);
    }

    if (source.sourceFilename) {
      sourceMap.set(source.sourceFilename, source);
    }

    sourceMap.set(source.id, source);
  }
  const engine = toSearchEngine(workspace);
  const results = (await workspace.search(parsedInput.query, {
    topK: limit,
    mode:
      engine === "hybrid" ? "hybrid" : engine === "vector" ? "vector" : "bm25",
  })) as WorkspaceSearchResult[];
  const hits = results
    .map((result) => {
      const sourcePath = result.metadata?.path?.trim();
      const source = sourceMap.get(sourcePath || result.id);

      if (!source) {
        return undefined;
      }

      return toSearchHit({
        engine,
        query: parsedInput.query,
        result,
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
    usedHitIds: hits.map((hit) => hit.chunkId),
    hits,
  };
}
