import type {
  BriefingExportCreateRequest,
  BriefingOpinionData,
} from "@atlas-kb/schema";
import { BadRequestError } from "@atlas-kb/errors";
import {
  createBriefingExport,
  listBriefingExports,
  requireKnowledgeSource,
} from "./repository";
import { throwMappedModelProviderError } from "./model-provider";
import { getKnowledgeServiceForUser } from "./runtime";

const BRIEFING_KEYS = [
  "sourceOrg",
  "documentCode",
  "documentTitle",
  "receivedAt",
  "briefingOpinion",
  "pendingQuestions",
] as const;
const BRIEFING_RETRY_DELAY_MS = 2_000;
const BRIEFING_MAX_ATTEMPTS = 3;

function readStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate =
    ("status" in error && typeof error.status === "number"
      ? error.status
      : undefined) ??
    ("statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : undefined);

  if (candidate) {
    return candidate;
  }

  const cause =
    "cause" in error && error.cause && typeof error.cause === "object"
      ? error.cause
      : undefined;

  if (!cause) {
    return undefined;
  }

  return (
    ("status" in cause && typeof cause.status === "number"
      ? cause.status
      : undefined) ??
    ("statusCode" in cause && typeof cause.statusCode === "number"
      ? cause.statusCode
      : undefined)
  );
}

function readErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  return [
    error.message,
    error.cause instanceof Error ? error.cause.message : "",
  ]
    .join(" ")
    .trim();
}

function isTransientBriefingFailure(error: unknown): boolean {
  const statusCode = readStatusCode(error);

  if (statusCode === 408 || statusCode === 429) {
    return true;
  }

  if (typeof statusCode === "number" && statusCode >= 500) {
    return true;
  }

  return /timed out|timeout|AbortError|ETIMEDOUT|rate limit|temporarily unavailable|service unavailable|internal server error|ECONNRESET|EAI_AGAIN|socket hang up|GenericFailure/i.test(
    readErrorText(error),
  );
}

function waitBriefingRetry() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, BRIEFING_RETRY_DELAY_MS);
  });
}

async function runBriefingTaskWithRetry(args: {
  service: Awaited<ReturnType<typeof getKnowledgeServiceForUser>>;
  documentId: string;
}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= BRIEFING_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await args.service.runKnowledgeTask({
        documentId: args.documentId,
        taskType: "briefing_opinion",
      });
    } catch (error) {
      lastError = error;

      if (attempt >= BRIEFING_MAX_ATTEMPTS) {
        break;
      }

      await waitBriefingRetry();
    }
  }

  if (isTransientBriefingFailure(lastError)) {
    throwMappedModelProviderError(lastError, "拟办意见生成");
  }

  throw lastError;
}

function toBriefingCitations(
  citations: Array<{
    documentId: string;
    segmentId: string;
    locatorStart: number;
    locatorEnd: number;
    excerpt: string;
  }>,
) {
  return citations.map((citation) => ({
    documentId: citation.documentId,
    segmentId: citation.segmentId,
    locatorStart: citation.locatorStart,
    locatorEnd: citation.locatorEnd,
    excerpt: citation.excerpt,
  }));
}

export async function generateBriefingOpinion(params: {
  userId: string;
  sourceId: string;
}): Promise<BriefingOpinionData> {
  const source = await requireKnowledgeSource(params.userId, params.sourceId);

  if (!source.documentId) {
    throw new BadRequestError("当前资料还没有可用的知识库文档索引");
  }

  const service = await getKnowledgeServiceForUser(params.userId);
  const result = await runBriefingTaskWithRetry({
    service,
    documentId: source.documentId,
  });
  const form = {
    sourceOrg: "",
    documentCode: "",
    documentTitle: "",
    receivedAt: "",
    briefingOpinion: "",
    pendingQuestions: "",
  };

  const fields = result.fields
    .filter(
      (
        field,
      ): field is (typeof result.fields)[number] & {
        key: (typeof BRIEFING_KEYS)[number];
      } => BRIEFING_KEYS.includes(field.key as (typeof BRIEFING_KEYS)[number]),
    )
    .map((field) => {
      form[field.key] = field.value;

      return {
        key: field.key,
        label: field.label,
        value: field.value,
        status: field.status,
        citations: toBriefingCitations(field.citations),
      };
    });

  const history = await listBriefingExports(params.userId, params.sourceId);

  return {
    source,
    briefing: {
      sourceId: source.id,
      documentId: source.documentId,
      title: result.title,
      summary: result.summary,
      form,
      fields,
      citations: toBriefingCitations(result.citations),
      generatedAt: result.generatedAt,
    },
    history,
  };
}

export async function saveBriefingExport(params: {
  userId: string;
  sourceId: string;
  input: BriefingExportCreateRequest;
}) {
  const source = await requireKnowledgeSource(params.userId, params.sourceId);

  if (!source.documentId) {
    throw new BadRequestError("当前资料还没有可导出的拟办意见结果");
  }

  const exportRecord = await createBriefingExport({
    userId: params.userId,
    sourceId: source.id,
    documentId: source.documentId,
    title: source.title,
    summary: params.input.summary,
    form: params.input.form,
    citations: params.input.citations ?? [],
  });

  return {
    export: exportRecord,
  };
}

export async function getBriefingExportHistory(params: {
  userId: string;
  sourceId: string;
}) {
  await requireKnowledgeSource(params.userId, params.sourceId);

  return {
    exports: await listBriefingExports(params.userId, params.sourceId),
  };
}
