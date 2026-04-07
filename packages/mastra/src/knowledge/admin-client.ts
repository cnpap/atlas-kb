import type {
  KnowledgeExportTask,
  KnowledgeTemplateDetail,
  KnowledgeTemplateSummary,
} from "@atlas-kb/schema";
import { getAdminApiBaseUrl, getInternalSecret } from "./config";

function requireInternalSecret(): string {
  const secret = getInternalSecret();

  if (!secret) {
    throw new Error("ATLAS_KB_INTERNAL_SECRET is required");
  }

  return secret;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T;
  return payload;
}

async function requestAdminInternal<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${getAdminApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Atlas-Kb-Internal-Secret": requireInternalSecret(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Admin request failed (${response.status}): ${text.trim() || response.statusText}`,
    );
  }

  return readJson<T>(response);
}

export async function listKnowledgeTemplatesFromAdmin(
  userId: string,
): Promise<KnowledgeTemplateSummary[]> {
  const payload = await requestAdminInternal<{
    data: KnowledgeTemplateSummary[];
  }>(`/api/internal/knowledge-templates?user_id=${encodeURIComponent(userId)}`);

  return payload.data;
}

export async function getKnowledgeTemplateDetailFromAdmin(args: {
  templateId: string;
  userId: string;
}): Promise<KnowledgeTemplateDetail> {
  const payload = await requestAdminInternal<{ data: KnowledgeTemplateDetail }>(
    `/api/internal/knowledge-templates/${encodeURIComponent(args.templateId)}?user_id=${encodeURIComponent(args.userId)}`,
  );

  return payload.data;
}

export async function listKnowledgeExportTasksFromAdmin(args: {
  sourceId?: string;
  userId: string;
}): Promise<KnowledgeExportTask[]> {
  const search = new URLSearchParams({
    user_id: args.userId,
  });

  if (args.sourceId) {
    search.set("source_id", args.sourceId);
  }

  const payload = await requestAdminInternal<{ data: KnowledgeExportTask[] }>(
    `/api/internal/knowledge-template-export-tasks?${search.toString()}`,
  );

  return payload.data;
}

export async function createKnowledgeExportTaskInAdmin(args: {
  sourceId: string;
  taskType?: string;
  templateId?: string;
  userId: string;
}): Promise<KnowledgeExportTask> {
  const payload = await requestAdminInternal<{ data: KnowledgeExportTask }>(
    "/api/internal/knowledge-template-export-tasks",
    {
      method: "POST",
      body: JSON.stringify({
        user_id: args.userId,
        source_id: args.sourceId,
        task_type: args.taskType,
        template_id: args.templateId,
      }),
    },
  );

  return payload.data;
}
