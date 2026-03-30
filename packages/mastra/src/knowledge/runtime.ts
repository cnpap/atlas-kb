import {
  createKnowledgeRuntime,
  createKnowledgeService,
  type KnowledgeRuntime,
  type KnowledgeService,
  type KnowledgeTenantBinding,
} from "@cnpap/ops-agent-kit";
import {
  getOpsMastraConfig,
  parseKnowledgeBlobBucket,
  resetKnowledgeConfigCache,
} from "./config";

let runtimePromise: Promise<KnowledgeRuntime> | undefined;
const serviceCache = new Map<string, KnowledgeService>();

function buildTenantBinding(userId: string): KnowledgeTenantBinding {
  const config = getOpsMastraConfig();

  return {
    tenantId: userId,
    blobStore: {
      bucket: parseKnowledgeBlobBucket(config.lanceUri),
      prefix: `knowledge-source/${userId}`,
      s3: {
        endpoint: config.lanceS3Endpoint,
        region: config.lanceS3Region,
        accessKeyId: config.lanceS3AccessKeyId,
        secretAccessKey: config.lanceS3SecretAccessKey,
        allowHttp: config.lanceS3AllowHttp,
        virtualHostedStyleRequest: config.lanceS3VirtualHostedStyleRequest,
      },
    },
  };
}

export async function getKnowledgeRuntime(): Promise<KnowledgeRuntime> {
  if (!runtimePromise) {
    const config = getOpsMastraConfig();

    runtimePromise = createKnowledgeRuntime({
      tikaBaseUrl: config.tikaBaseUrl,
      vectorStore: {
        lanceUri: config.lanceUri,
        s3: {
          endpoint: config.lanceS3Endpoint,
          region: config.lanceS3Region,
          accessKeyId: config.lanceS3AccessKeyId,
          secretAccessKey: config.lanceS3SecretAccessKey,
          allowHttp: config.lanceS3AllowHttp,
          virtualHostedStyleRequest: config.lanceS3VirtualHostedStyleRequest,
        },
      },
      models: {
        llm: config.llm,
        embedding: config.embedding,
        rerank: config.rerank,
        vision: config.vision,
      },
      knowledge: config.knowledge,
    });
  }

  return runtimePromise;
}

export async function getKnowledgeServiceForUser(
  userId: string,
): Promise<KnowledgeService> {
  const cached = serviceCache.get(userId);

  if (cached) {
    return cached;
  }

  const service = createKnowledgeService({
    runtime: await getKnowledgeRuntime(),
    tenant: buildTenantBinding(userId),
  });

  serviceCache.set(userId, service);
  return service;
}

export function resetKnowledgeRuntimeCache(): void {
  runtimePromise = undefined;
  serviceCache.clear();
  resetKnowledgeConfigCache();
}
