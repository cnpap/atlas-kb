import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getKnowledgeS3AccessKeyId,
  getKnowledgeS3Bucket,
  getKnowledgeS3Endpoint,
  getKnowledgeS3ForcePathStyle,
  getKnowledgeS3Prefix,
  getKnowledgeS3Region,
  getKnowledgeS3SecretAccessKey,
  validateKnowledgeStorageConfig,
} from "./config";
import { normalizeWhitespace } from "./search-utils";

type StoredObjectInfo = {
  contentType?: string;
  key: string;
  lastModified?: Date;
  size: number;
};

type KnowledgeObjectStorageClient = {
  copyObject(args: {
    destinationKey: string;
    sourceKey: string;
  }): Promise<void>;
  deleteObject(args: { key: string }): Promise<void>;
  getObject(args: { key: string }): Promise<Uint8Array>;
  headObject(args: { key: string }): Promise<StoredObjectInfo | null>;
  listObjects(args: { prefix: string }): Promise<StoredObjectInfo[]>;
  putObject(args: {
    body: string | Uint8Array;
    contentType?: string;
    key: string;
  }): Promise<void>;
};

let clientOverride: KnowledgeObjectStorageClient | undefined;

function sanitizeSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-") || "item";
}

function normalizeRelativePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

async function readObjectBody(response: Awaited<ReturnType<S3Client["send"]>>) {
  const body = (
    response as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } }
  ).Body;

  if (!body?.transformToByteArray) {
    return new Uint8Array();
  }

  return body.transformToByteArray();
}

function toStoredObjectInfo(
  key: string,
  response: Pick<
    HeadObjectCommandOutput,
    "ContentLength" | "ContentType" | "LastModified"
  >,
): StoredObjectInfo {
  return {
    key,
    size: Number(response.ContentLength ?? 0),
    contentType: response.ContentType ?? undefined,
    lastModified: response.LastModified ?? undefined,
  };
}

function createKnowledgeObjectStorageClient(): KnowledgeObjectStorageClient {
  if (clientOverride) {
    return clientOverride;
  }

  validateKnowledgeStorageConfig();
  const bucket = getKnowledgeS3Bucket()!;
  const accessKeyId = getKnowledgeS3AccessKeyId()!;
  const secretAccessKey = getKnowledgeS3SecretAccessKey()!;

  const client = new S3Client({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint: getKnowledgeS3Endpoint()!,
    forcePathStyle: getKnowledgeS3ForcePathStyle(),
    region: getKnowledgeS3Region()!,
  });

  return {
    async copyObject(args) {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${args.sourceKey}`,
          Key: args.destinationKey,
        }),
      );
    },
    async deleteObject(args) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: args.key,
        }),
      );
    },
    async getObject(args) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: args.key,
        }),
      );

      return readObjectBody(response);
    },
    async headObject(args) {
      try {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: args.key,
          }),
        );

        return toStoredObjectInfo(args.key, response);
      } catch {
        return null;
      }
    },
    async listObjects(args) {
      const objects: StoredObjectInfo[] = [];
      let continuationToken: string | undefined;

      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken,
            Prefix: args.prefix,
          }),
        );

        for (const item of response.Contents ?? []) {
          if (!item.Key) {
            continue;
          }

          objects.push({
            key: item.Key,
            size: Number(item.Size ?? 0),
            lastModified: item.LastModified ?? undefined,
          });
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return objects;
    },
    async putObject(args) {
      await client.send(
        new PutObjectCommand({
          Body: args.body,
          Bucket: bucket,
          ContentType: args.contentType,
          Key: args.key,
        }),
      );
    },
  };
}

export function buildKnowledgeSourceObjectPrefix(args: {
  collectionId: string;
  userId: string;
}): string {
  const prefix = getKnowledgeS3Prefix().replace(/^\/+|\/+$/g, "");

  return [
    prefix,
    sanitizeSegment(args.userId),
    sanitizeSegment(args.collectionId),
  ]
    .filter(Boolean)
    .join("/");
}

export function buildKnowledgeSourceObjectKey(args: {
  collectionId: string;
  relativePath: string;
  userId: string;
}): string {
  return [
    buildKnowledgeSourceObjectPrefix(args),
    normalizeRelativePath(args.relativePath),
  ]
    .filter(Boolean)
    .join("/");
}

export async function putKnowledgeSourceObject(args: {
  body: string | Uint8Array;
  collectionId: string;
  contentType?: string;
  relativePath: string;
  userId: string;
}) {
  const client = createKnowledgeObjectStorageClient();

  await client.putObject({
    body: args.body,
    contentType: args.contentType,
    key: buildKnowledgeSourceObjectKey(args),
  });
}

export async function putKnowledgeTextSourceObject(args: {
  collectionId: string;
  content: string;
  relativePath: string;
  userId: string;
}) {
  await putKnowledgeSourceObject({
    collectionId: args.collectionId,
    relativePath: args.relativePath,
    userId: args.userId,
    body: normalizeWhitespace(args.content),
    contentType: "text/plain; charset=utf-8",
  });
}

export async function getKnowledgeSourceObject(args: {
  collectionId: string;
  relativePath: string;
  userId: string;
}) {
  const client = createKnowledgeObjectStorageClient();

  return client.getObject({
    key: buildKnowledgeSourceObjectKey(args),
  });
}

export async function copyKnowledgeSourceObject(args: {
  collectionId: string;
  destinationPath: string;
  sourcePath: string;
  userId: string;
}) {
  const client = createKnowledgeObjectStorageClient();

  await client.copyObject({
    sourceKey: buildKnowledgeSourceObjectKey({
      userId: args.userId,
      collectionId: args.collectionId,
      relativePath: args.sourcePath,
    }),
    destinationKey: buildKnowledgeSourceObjectKey({
      userId: args.userId,
      collectionId: args.collectionId,
      relativePath: args.destinationPath,
    }),
  });
}

export async function deleteKnowledgeSourceObject(args: {
  collectionId: string;
  relativePath: string;
  userId: string;
}) {
  const client = createKnowledgeObjectStorageClient();

  await client
    .deleteObject({
      key: buildKnowledgeSourceObjectKey(args),
    })
    .catch(() => undefined);
}

export async function deleteKnowledgeCollectionObjects(args: {
  collectionId: string;
  userId: string;
}) {
  const client = createKnowledgeObjectStorageClient();
  const prefix = `${buildKnowledgeSourceObjectPrefix(args)}/`;
  const objects = await client.listObjects({ prefix });

  await Promise.all(
    objects.map((object) =>
      client.deleteObject({
        key: object.key,
      }),
    ),
  );
}

export async function headKnowledgeSourceObject(args: {
  collectionId: string;
  relativePath: string;
  userId: string;
}) {
  const client = createKnowledgeObjectStorageClient();

  return client.headObject({
    key: buildKnowledgeSourceObjectKey(args),
  });
}

export async function listKnowledgeSourceObjects(args: {
  collectionId: string;
  userId: string;
}) {
  const client = createKnowledgeObjectStorageClient();
  const prefix = `${buildKnowledgeSourceObjectPrefix(args)}/`;
  const objects = await client.listObjects({ prefix });

  return objects.map((object) => ({
    ...object,
    relativePath: object.key.slice(prefix.length),
  }));
}

const DEFAULT_PRESIGN_EXPIRY = 900; // 15 minutes

function createRawS3Client(): { client: S3Client; bucket: string } {
  validateKnowledgeStorageConfig();
  const bucket = getKnowledgeS3Bucket()!;
  const client = new S3Client({
    credentials: {
      accessKeyId: getKnowledgeS3AccessKeyId()!,
      secretAccessKey: getKnowledgeS3SecretAccessKey()!,
    },
    endpoint: getKnowledgeS3Endpoint()!,
    forcePathStyle: getKnowledgeS3ForcePathStyle(),
    region: getKnowledgeS3Region()!,
  });
  return { client, bucket };
}

export async function getPresignedPutUrl(args: {
  userId: string;
  collectionId: string;
  relativePath: string;
  contentType?: string;
  expiresIn?: number;
}): Promise<string> {
  const { client, bucket } = createRawS3Client();
  const key = buildKnowledgeSourceObjectKey(args);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: args.contentType,
  });
  return getSignedUrl(client, command, {
    expiresIn: args.expiresIn ?? DEFAULT_PRESIGN_EXPIRY,
  });
}

export async function getPresignedGetUrl(args: {
  userId: string;
  collectionId: string;
  relativePath: string;
  expiresIn?: number;
}): Promise<string> {
  const { client, bucket } = createRawS3Client();
  const key = buildKnowledgeSourceObjectKey(args);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(client, command, {
    expiresIn: args.expiresIn ?? DEFAULT_PRESIGN_EXPIRY,
  });
}

export function setKnowledgeObjectStorageClientForTests(
  client?: Partial<KnowledgeObjectStorageClient>,
): void {
  if (!client) {
    clientOverride = undefined;
    return;
  }

  clientOverride = {
    async copyObject() {
      throw new Error("copyObject is not configured for tests");
    },
    async deleteObject() {
      return;
    },
    async getObject() {
      throw new Error("getObject is not configured for tests");
    },
    async headObject() {
      return null;
    },
    async listObjects() {
      return [];
    },
    async putObject() {
      return;
    },
    ...client,
  };
}
