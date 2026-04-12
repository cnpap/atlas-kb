import {
  getDatabaseUrl,
  validateKnowledgeStorageConfig,
} from "../knowledge/config";
import { knowledgeSourceImportWorkflow } from "../knowledge/source-import-workflow";
import { memory } from "../memory";
import { tools } from "../tools";
import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";

validateKnowledgeStorageConfig();

function getMastraPort(): number {
  const value = Number(process.env.MASTRA_PORT ?? 4111);

  if (!Number.isInteger(value) || value <= 0) {
    return 4111;
  }

  return value;
}

function getMastraHost(): string {
  const host = process.env.MASTRA_HOST?.trim();
  return host && host.length > 0 ? host : "127.0.0.1";
}

const defaultStorage = new PostgresStore({
  id: "default-storage",
  connectionString: getDatabaseUrl(),
  schemaName: "atlas_kb_mastra",
});

export const mastra = new Mastra({
  agents: {},
  tools,
  storage: defaultStorage,
  memory,
  workflows: {
    knowledgeSourceImportWorkflow,
  },
  server: {
    host: getMastraHost(),
    port: getMastraPort(),
  },
});
