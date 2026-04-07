import type { BriefingExport } from "@atlas-kb/schema";
import { ensureKnowledgeDatabase } from "./db";
import { nowIso, toBriefingExport, toDbUserId } from "./repository-shared";

export async function listBriefingExports(
  userId: string,
  sourceId: string,
): Promise<BriefingExport[]> {
  const db = await ensureKnowledgeDatabase();
  const rows = await db
    .selectFrom("kb_briefing_exports")
    .select([
      "id",
      "owner_user_id",
      "source_id",
      "document_id",
      "title",
      "summary",
      "form_json",
      "citations_json",
      "created_at",
    ])
    .where("owner_user_id", "=", toDbUserId(userId))
    .where("source_id", "=", sourceId)
    .orderBy("created_at", "desc")
    .execute();

  return rows.map((row) => toBriefingExport(row));
}

export async function createBriefingExport(params: {
  userId: string;
  sourceId: string;
  documentId: string;
  title: string;
  summary: string;
  form: BriefingExport["form"];
  citations: BriefingExport["citations"];
}): Promise<BriefingExport> {
  const db = await ensureKnowledgeDatabase();
  const exportRecord: BriefingExport = {
    id: crypto.randomUUID(),
    sourceId: params.sourceId,
    documentId: params.documentId,
    title: params.title,
    summary: params.summary,
    form: params.form,
    citations: params.citations,
    createdAt: nowIso(),
  };

  await db
    .insertInto("kb_briefing_exports")
    .values({
      id: exportRecord.id,
      owner_user_id: toDbUserId(params.userId),
      source_id: params.sourceId,
      document_id: params.documentId,
      title: params.title,
      summary: params.summary,
      form_json: params.form,
      citations_json: params.citations,
      created_at: exportRecord.createdAt,
    })
    .execute();

  return exportRecord;
}
