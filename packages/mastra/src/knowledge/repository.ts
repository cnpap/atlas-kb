import { ConflictError, NotFoundError } from "@atlas-kb/errors";
import type {
  KnowledgeDocument,
  KnowledgeDocumentsData,
  KnowledgeSpace,
  KnowledgeSpaceCreateRequest,
} from "@atlas-kb/schema";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getKnowledgeDatabasePath } from "./config";
import { SEED_DOCUMENTS, SEED_SPACES } from "./seed";

export interface StoredKnowledgeDocument extends KnowledgeDocument {
  chunkCount?: number;
  storagePath?: string;
  vectorIndexedAt?: string;
}

interface KnowledgeDatabase {
  version: 1;
  documents: StoredKnowledgeDocument[];
  spaces: KnowledgeSpace[];
}

let databaseCache: KnowledgeDatabase | undefined;
let writeChain = Promise.resolve();

function cloneSpace(space: KnowledgeSpace): KnowledgeSpace {
  return { ...space };
}

function cloneDocument(
  document: StoredKnowledgeDocument | KnowledgeDocument,
): KnowledgeDocument {
  const {
    chunkCount: _chunkCount,
    storagePath: _storagePath,
    vectorIndexedAt: _vectorIndexedAt,
    ...rest
  } = document as StoredKnowledgeDocument;

  return {
    ...rest,
    tags: [...rest.tags],
  };
}

function cloneStoredDocument(
  document: StoredKnowledgeDocument,
): StoredKnowledgeDocument {
  return {
    ...document,
    tags: [...document.tags],
  };
}

function slugify(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "space";
}

function createSeedDatabase(): KnowledgeDatabase {
  return {
    version: 1,
    spaces: SEED_SPACES.map(cloneSpace),
    documents: SEED_DOCUMENTS.map((document) => ({
      ...cloneDocument(document),
    })),
  };
}

function normalizeLoadedDatabase(raw: unknown): KnowledgeDatabase {
  if (!raw || typeof raw !== "object") {
    return createSeedDatabase();
  }

  const candidate = raw as Partial<KnowledgeDatabase>;
  const spaces = Array.isArray(candidate.spaces)
    ? candidate.spaces
        .filter((space): space is KnowledgeSpace => Boolean(space))
        .map((space) => ({
          ...space,
        }))
    : [];

  const documents = Array.isArray(candidate.documents)
    ? candidate.documents
        .filter((document): document is StoredKnowledgeDocument =>
          Boolean(document),
        )
        .map((document) => ({
          ...document,
          tags: Array.isArray(document.tags) ? [...document.tags] : [],
        }))
    : [];

  if (spaces.length === 0 && documents.length === 0) {
    return createSeedDatabase();
  }

  return {
    version: 1,
    spaces,
    documents,
  };
}

async function persistDatabase(database: KnowledgeDatabase): Promise<void> {
  const path = getKnowledgeDatabasePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(database, null, 2));
}

async function loadDatabase(): Promise<KnowledgeDatabase> {
  if (databaseCache) {
    return databaseCache;
  }

  const path = getKnowledgeDatabasePath();

  try {
    const file = await readFile(path, "utf8");
    databaseCache = normalizeLoadedDatabase(JSON.parse(file) as unknown);
  } catch {
    databaseCache = createSeedDatabase();
    await persistDatabase(databaseCache);
  }

  return databaseCache;
}

async function mutateDatabase<T>(
  mutator: (database: KnowledgeDatabase) => T | Promise<T>,
): Promise<T> {
  let result!: T;

  const nextMutation = writeChain
    .catch(() => undefined)
    .then(async () => {
      const database = await loadDatabase();
      result = await mutator(database);
      await persistDatabase(database);
    });

  writeChain = nextMutation.then(() => undefined);
  await nextMutation;
  return result;
}

export function toPublicDocument(
  document: StoredKnowledgeDocument,
): KnowledgeDocument {
  return cloneDocument(document);
}

export async function listKnowledgeSpaces(): Promise<KnowledgeSpace[]> {
  const database = await loadDatabase();

  return database.spaces
    .map(cloneSpace)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getKnowledgeSpace(
  spaceId: string,
): Promise<KnowledgeSpace | undefined> {
  const database = await loadDatabase();
  const space = database.spaces.find((item) => item.id === spaceId);
  return space ? cloneSpace(space) : undefined;
}

export async function requireKnowledgeSpace(
  spaceId: string,
): Promise<KnowledgeSpace> {
  const space = await getKnowledgeSpace(spaceId);

  if (!space) {
    throw new NotFoundError(`Knowledge space "${spaceId}" not found`);
  }

  return space;
}

export async function createKnowledgeSpace(
  input: KnowledgeSpaceCreateRequest,
): Promise<KnowledgeSpace> {
  return mutateDatabase((database) => {
    const id = input.id ? slugify(input.id) : slugify(input.name);

    if (database.spaces.some((space) => space.id === id)) {
      throw new ConflictError(`Knowledge space "${id}" already exists`);
    }

    const now = new Date().toISOString();
    const space: KnowledgeSpace = {
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      documentCount: 0,
      updatedAt: now,
    };

    database.spaces.push(space);
    return cloneSpace(space);
  });
}

export async function listKnowledgeDocuments(
  spaceId?: string,
): Promise<KnowledgeDocument[]> {
  const database = await loadDatabase();

  return database.documents
    .filter((document) => (spaceId ? document.spaceId === spaceId : true))
    .map(toPublicDocument)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getKnowledgeSpaceDocuments(
  spaceId: string,
): Promise<KnowledgeDocumentsData> {
  const [space, documents] = await Promise.all([
    requireKnowledgeSpace(spaceId),
    listKnowledgeDocuments(spaceId),
  ]);

  return {
    space,
    documents,
  };
}

export async function listStoredKnowledgeDocuments(
  spaceId?: string,
): Promise<StoredKnowledgeDocument[]> {
  const database = await loadDatabase();

  return database.documents
    .filter((document) => (spaceId ? document.spaceId === spaceId : true))
    .map(cloneStoredDocument)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createKnowledgeDocument(params: {
  spaceId: string;
  title: string;
  summary: string;
  excerpt: string;
  content: string;
  tags: string[];
  source: KnowledgeDocument["source"];
  sourceFilename?: string;
  mimeType?: string;
  byteSize?: number;
  storagePath?: string;
}): Promise<KnowledgeDocument> {
  return mutateDatabase((database) => {
    const space = database.spaces.find((item) => item.id === params.spaceId);

    if (!space) {
      throw new NotFoundError(`Knowledge space "${params.spaceId}" not found`);
    }

    const now = new Date().toISOString();
    const baseId = slugify(params.title || params.sourceFilename || "document");
    let id = baseId;
    let suffix = 1;

    while (database.documents.some((document) => document.id === id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const document: StoredKnowledgeDocument = {
      id,
      spaceId: params.spaceId,
      title: params.title.trim(),
      summary: params.summary.trim(),
      excerpt: params.excerpt.trim(),
      content: params.content.trim(),
      tags: [...params.tags],
      source: params.source,
      sourceFilename: params.sourceFilename,
      mimeType: params.mimeType,
      byteSize: params.byteSize,
      storagePath: params.storagePath,
      createdAt: now,
      updatedAt: now,
    };

    database.documents.push(document);
    space.documentCount += 1;
    space.updatedAt = now;

    return toPublicDocument(document);
  });
}

export async function markDocumentVectorIndexed(params: {
  chunkCount: number;
  documentId: string;
}): Promise<void> {
  await mutateDatabase((database) => {
    const document = database.documents.find(
      (item) => item.id === params.documentId,
    );

    if (!document) {
      throw new NotFoundError(
        `Knowledge document "${params.documentId}" not found`,
      );
    }

    document.chunkCount = params.chunkCount;
    document.vectorIndexedAt = new Date().toISOString();
  });
}

export async function getDocumentById(
  documentId: string,
): Promise<StoredKnowledgeDocument | undefined> {
  const database = await loadDatabase();
  const document = database.documents.find((item) => item.id === documentId);
  return document ? cloneStoredDocument(document) : undefined;
}

export async function getDocumentsPendingVectorIndex(): Promise<
  StoredKnowledgeDocument[]
> {
  const database = await loadDatabase();

  return database.documents
    .filter((document) => !document.vectorIndexedAt)
    .map(cloneStoredDocument);
}

export function resetKnowledgeRepository(): void {
  databaseCache = undefined;
  writeChain = Promise.resolve();
}
