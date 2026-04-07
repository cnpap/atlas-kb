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

function mapTemplateSummary(item: {
  id: string;
  name: string;
  template_type: string;
  source_filename: string;
  field_count: number;
  reference_library_count: number;
  parsed_at?: string | null;
  updated_at: string;
}): KnowledgeTemplateSummary {
  return {
    id: item.id,
    name: item.name,
    templateType: item.template_type,
    sourceFilename: item.source_filename,
    fieldCount: item.field_count,
    referenceLibraryCount: item.reference_library_count,
    parsedAt: item.parsed_at ?? undefined,
    updatedAt: item.updated_at,
  };
}

function mapTemplateDetail(item: {
  id: string;
  name: string;
  template_type: string;
  source_filename: string;
  field_count: number;
  reference_library_count: number;
  parsed_at?: string | null;
  updated_at: string;
  system_prompt: string;
  fields: Array<{
    id: string;
    name: string;
    label: string;
    description?: string | null;
    sort_order: number;
    locations: Array<Record<string, unknown>>;
  }>;
  reference_libraries: Array<{
    id: string;
    name: string;
    storage_prefix: string;
    file_count: number;
  }>;
}): KnowledgeTemplateDetail {
  return {
    ...mapTemplateSummary(item),
    systemPrompt: item.system_prompt,
    fields: item.fields.map((field) => ({
      id: field.id,
      name: field.name,
      label: field.label,
      description: field.description ?? "",
      sortOrder: field.sort_order,
      locations: field.locations ?? [],
    })),
    referenceLibraries: item.reference_libraries.map((library) => ({
      id: library.id,
      name: library.name,
      storagePrefix: library.storage_prefix,
      fileCount: library.file_count,
    })),
  };
}

function mapExportTask(item: {
  id: string;
  owner_user_id: number | string;
  source_id: string;
  source_title: string;
  task_type: string;
  template_id: string;
  template_name: string;
  status: "pending" | "processing" | "completed" | "failed";
  failure_message?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  export?: {
    id: string;
    template_id: string;
    output_filename: string;
    mime_type: string;
    byte_size: number;
    download_url: string;
    expires_at?: string | null;
    created_at: string;
  } | null;
}): KnowledgeExportTask {
  return {
    id: item.id,
    ownerUserId: String(item.owner_user_id),
    sourceId: item.source_id,
    sourceTitle: item.source_title,
    taskType: item.task_type,
    templateId: item.template_id,
    templateName: item.template_name,
    status: item.status,
    failureMessage: item.failure_message ?? undefined,
    exportFile: item.export
      ? {
          id: item.export.id,
          templateId: item.export.template_id,
          outputFilename: item.export.output_filename,
          mimeType: item.export.mime_type,
          byteSize: item.export.byte_size,
          downloadUrl: item.export.download_url,
          expiresAt: item.export.expires_at ?? undefined,
          createdAt: item.export.created_at,
        }
      : undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    startedAt: item.started_at ?? undefined,
    completedAt: item.completed_at ?? undefined,
    failedAt: item.failed_at ?? undefined,
  };
}

export async function listKnowledgeTemplatesFromAdmin(
  userId: string,
): Promise<KnowledgeTemplateSummary[]> {
  const payload = await requestAdminInternal<{ data: unknown[] }>(
    `/api/internal/knowledge-templates?user_id=${encodeURIComponent(userId)}`,
  );

  return payload.data.map((item) =>
    mapTemplateSummary(item as Parameters<typeof mapTemplateSummary>[0]),
  );
}

export async function getKnowledgeTemplateDetailFromAdmin(args: {
  templateId: string;
  userId: string;
}): Promise<KnowledgeTemplateDetail> {
  const payload = await requestAdminInternal<{ data: unknown }>(
    `/api/internal/knowledge-templates/${encodeURIComponent(args.templateId)}?user_id=${encodeURIComponent(args.userId)}`,
  );

  return mapTemplateDetail(
    payload.data as Parameters<typeof mapTemplateDetail>[0],
  );
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

  const payload = await requestAdminInternal<{ data: unknown[] }>(
    `/api/internal/knowledge-template-export-tasks?${search.toString()}`,
  );

  return payload.data.map((item) =>
    mapExportTask(item as Parameters<typeof mapExportTask>[0]),
  );
}

export async function createKnowledgeExportTaskInAdmin(args: {
  sourceId: string;
  taskType?: string;
  templateId?: string;
  userId: string;
}): Promise<KnowledgeExportTask> {
  const payload = await requestAdminInternal<{ data: unknown }>(
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

  return mapExportTask(payload.data as Parameters<typeof mapExportTask>[0]);
}
