import { createAgents } from "../agents";
import { memory } from "../memory";
import { apiRoutes } from "../routes";
import { tools } from "../tools";
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

function getMastraStorageUrl(): string {
  const storageUrl = process.env.MASTRA_STORAGE_PATH?.trim();
  if (storageUrl && storageUrl.length > 0) {
    return storageUrl;
  }

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  return pathToFileURL(resolve(packageRoot, ".mastra", "storage.db")).href;
}

export const defaultStorage = new LibSQLStore({
  id: "atlas-kb-storage",
  url: getMastraStorageUrl(),
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
