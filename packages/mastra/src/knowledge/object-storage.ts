import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

export function buildKnowledgeSourceObjectPrefix(args: {
  collectionId: string;
  userId: string;
}): string {
  // 每个用户、每个资料库在对象存储里都有一个独立根目录。
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
  // 业务里的 workspace 相对路径或 documentId，会映射到最终的 S3 key。
  return [
    buildKnowledgeSourceObjectPrefix(args),
    normalizeRelativePath(args.relativePath),
  ]
    .filter(Boolean)
    .join("/");
}

const DEFAULT_PRESIGN_EXPIRY = 900;

function createRawS3Client(): { client: S3Client; bucket: string } {
  validateKnowledgeStorageConfig();

  return {
    bucket: getKnowledgeS3Bucket()!,
    client: new S3Client({
      credentials: {
        accessKeyId: getKnowledgeS3AccessKeyId()!,
        secretAccessKey: getKnowledgeS3SecretAccessKey()!,
      },
      endpoint: getKnowledgeS3Endpoint()!,
      forcePathStyle: getKnowledgeS3ForcePathStyle(),
      region: getKnowledgeS3Region()!,
    }),
  };
}

export async function getPresignedGetUrl(args: {
  userId: string;
  collectionId: string;
  relativePath: string;
  expiresIn?: number;
}): Promise<string> {
  // 下载链路只需要把资料路径转换成一个可下载的临时签名地址。
  const { client, bucket } = createRawS3Client();
  const key = buildKnowledgeSourceObjectKey(args);

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    {
      expiresIn: args.expiresIn ?? DEFAULT_PRESIGN_EXPIRY,
    },
  );
}
