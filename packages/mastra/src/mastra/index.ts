import { createAgents } from "../agents";
import { getDatabaseUrl } from "../knowledge/config";
import { memory } from "../memory";
import { apiRoutes } from "../routes";
import { tools } from "../tools";
import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";

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

export const defaultStorage = new PostgresStore({
  id: "atlas-kb-storage",
  connectionString: getDatabaseUrl(),
  schemaName: "atlas_kb_mastra",
});

export const mastra = new Mastra({
  agents: createAgents(),
  tools,
  storage: defaultStorage,
  memory,
  server: {
    host: getMastraHost(),
    port: getMastraPort(),
    apiRoutes,
  },
});
