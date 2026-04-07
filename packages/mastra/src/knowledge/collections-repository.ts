import { NotFoundError } from "@atlas-kb/errors";
import type {
  DashboardSummary,
  KnowledgeCollection,
  KnowledgeCollectionCreateRequest,
  KnowledgeCollectionData,
  KnowledgeCollectionUpdateRequest,
} from "@atlas-kb/schema";
import { sql } from "kysely";
import { ensureKnowledgeDatabase } from "./db";
import { invalidateKnowledgeWorkspace, getKnowledgeWorkspace } from "./runtime";
import { slugify } from "./search-utils";
import {
  nowIso,
  toCollection,
  toDbUserId,
  type CollectionRow,
} from "./repository-shared";

function buildCollectionQuery(userId: string) {
  return ensureKnowledgeDatabase().then((db) =>
    db
      .selectFrom("kb_collections as c")
      .leftJoin("kb_sources as s", (join) =>
        join
          .onRef("s.collection_id", "=", "c.id")
          .onRef("s.owner_user_id", "=", "c.owner_user_id"),
      )
      .select([
        "c.id as id",
        "c.owner_user_id as owner_user_id",
        "c.name as name",
        "c.description as description",
        "c.color as color",
        "c.icon as icon",
        "c.is_pinned as is_pinned",
        "c.created_at as created_at",
        "c.updated_at as updated_at",
        "c.last_activity_at as last_activity_at",
      ])
      .select([
        sql<number>`cast(count(${sql.ref("s.id")}) as integer)`.as(
          "document_count",
        ),
        sql<number>`cast(count(${sql.ref("s.id")}) filter (where ${sql.ref("s.status")} = 'ready') as integer)`.as(
          "ready_document_count",
        ),
        sql<number>`cast(count(${sql.ref("s.id")}) filter (where ${sql.ref("s.status")} = 'processing') as integer)`.as(
          "processing_document_count",
        ),
        sql<number>`cast(count(${sql.ref("s.id")}) filter (where ${sql.ref("s.status")} = 'failed') as integer)`.as(
          "failed_document_count",
        ),
      ])
      .where("c.owner_user_id", "=", toDbUserId(userId))
      .groupBy([
        "c.id",
        "c.owner_user_id",
        "c.name",
        "c.description",
        "c.color",
        "c.icon",
        "c.is_pinned",
        "c.created_at",
        "c.updated_at",
        "c.last_activity_at",
      ]),
  );
}

async function countRows(args: {
  table: "kb_chat_sessions" | "kb_collections" | "kb_sources";
  userId: string;
  status?: "failed" | "processing" | "ready";
}): Promise<number> {
  const db = await ensureKnowledgeDatabase();
  let query = db
    .selectFrom(args.table)
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("owner_user_id", "=", toDbUserId(args.userId));

  if (args.table === "kb_sources" && args.status) {
    query = query.where("status", "=", args.status);
  }

  const row = await query.executeTakeFirst();
  return Number(row?.count ?? 0);
}

export async function touchCollection(collectionId: string) {
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();

  await db
    .updateTable("kb_collections")
    .set({
      last_activity_at: now,
      updated_at: now,
    })
    .where("id", "=", collectionId)
    .execute();
}

export async function getCollectionRow(
  userId: string,
  collectionId: string,
): Promise<CollectionRow | null> {
  const query = await buildCollectionQuery(userId);
  return (
    (await query.where("c.id", "=", collectionId).executeTakeFirst()) ?? null
  );
}

export async function listKnowledgeCollections(
  userId: string,
): Promise<KnowledgeCollection[]> {
  const rows = await (await buildCollectionQuery(userId))
    .orderBy("c.is_pinned", "desc")
    .orderBy("c.updated_at", "desc")
    .execute();

  return rows.map((row) => toCollection(row));
}

export async function createKnowledgeCollection(params: {
  userId: string;
  input: KnowledgeCollectionCreateRequest;
}): Promise<KnowledgeCollection> {
  const db = await ensureKnowledgeDatabase();
  const now = nowIso();
  const id =
    params.input.id?.trim() ||
    `${slugify(params.input.name).slice(0, 40)}-${crypto.randomUUID().slice(0, 8)}`;

  await db
    .insertInto("kb_collections")
    .values({
      id,
      owner_user_id: toDbUserId(params.userId),
      name: params.input.name.trim(),
      description: params.input.description.trim(),
      color: params.input.color?.trim() || "#0f766e",
      icon: params.input.icon?.trim() || "i-lucide-library",
      is_pinned: false,
      created_at: now,
      updated_at: now,
      last_activity_at: now,
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();

  return requireKnowledgeCollection(params.userId, id);
}

export async function getKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollection | undefined> {
  const row = await getCollectionRow(userId, collectionId);
  return row ? toCollection(row) : undefined;
}

export async function requireKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollection> {
  const collection = await getKnowledgeCollection(userId, collectionId);

  if (!collection) {
    throw new NotFoundError(`Collection "${collectionId}" not found`);
  }

  return collection;
}

export async function getKnowledgeCollectionData(
  userId: string,
  collectionId: string,
): Promise<KnowledgeCollectionData> {
  return {
    collection: await requireKnowledgeCollection(userId, collectionId),
  };
}

export async function updateKnowledgeCollection(params: {
  userId: string;
  collectionId: string;
  input: KnowledgeCollectionUpdateRequest;
}): Promise<KnowledgeCollection> {
  await requireKnowledgeCollection(params.userId, params.collectionId);
  const db = await ensureKnowledgeDatabase();

  const updates = {
    updated_at: nowIso(),
  } as {
    color?: string;
    description?: string;
    icon?: string;
    is_pinned?: boolean;
    name?: string;
    updated_at: string;
  };

  if (params.input.name?.trim()) {
    updates.name = params.input.name.trim();
  }

  if (params.input.description?.trim()) {
    updates.description = params.input.description.trim();
  }

  if (params.input.color?.trim()) {
    updates.color = params.input.color.trim();
  }

  if (params.input.icon?.trim()) {
    updates.icon = params.input.icon.trim();
  }

  if (typeof params.input.isPinned === "boolean") {
    updates.is_pinned = params.input.isPinned;
  }

  await db
    .updateTable("kb_collections")
    .set(updates)
    .where("owner_user_id", "=", toDbUserId(params.userId))
    .where("id", "=", params.collectionId)
    .execute();

  return requireKnowledgeCollection(params.userId, params.collectionId);
}

export async function deleteKnowledgeCollection(
  userId: string,
  collectionId: string,
): Promise<void> {
  const db = await ensureKnowledgeDatabase();
  const workspace = await getKnowledgeWorkspace({
    userId,
    collectionId,
  }).catch(() => undefined);

  await db
    .deleteFrom("kb_collections")
    .where("owner_user_id", "=", toDbUserId(userId))
    .where("id", "=", collectionId)
    .execute();

  await workspace?.filesystem
    ?.rmdir("", { recursive: true })
    .catch(() => undefined);

  await invalidateKnowledgeWorkspace({
    userId,
    collectionId,
  });
}

export async function getDashboardCounts(userId: string): Promise<{
  chatSessionsCount: DashboardSummary["chatSessionsCount"];
  collectionsCount: DashboardSummary["collectionsCount"];
  failedSourcesCount: DashboardSummary["failedSourcesCount"];
  processingSourcesCount: DashboardSummary["processingSourcesCount"];
  readySourcesCount: DashboardSummary["readySourcesCount"];
}> {
  const [
    collectionsCount,
    readySourcesCount,
    processingSourcesCount,
    failedSourcesCount,
    chatSessionsCount,
  ] = await Promise.all([
    countRows({
      table: "kb_collections",
      userId,
    }),
    countRows({
      table: "kb_sources",
      userId,
      status: "ready",
    }),
    countRows({
      table: "kb_sources",
      userId,
      status: "processing",
    }),
    countRows({
      table: "kb_sources",
      userId,
      status: "failed",
    }),
    countRows({
      table: "kb_chat_sessions",
      userId,
    }),
  ]);

  return {
    chatSessionsCount,
    collectionsCount,
    failedSourcesCount,
    processingSourcesCount,
    readySourcesCount,
  };
}
