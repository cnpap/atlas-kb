import { createApp } from "./app";
import { getApiHost, getApiIdleTimeoutSeconds, getApiPort } from "./env";
import { startFailedKnowledgeSourceAutoRetryScheduler } from "@atlas-kb/mastra/knowledge";

const host = getApiHost();
const port = getApiPort();
const app = createApp();

startFailedKnowledgeSourceAutoRetryScheduler();

app.listen({
  hostname: host,
  port,
  idleTimeout: getApiIdleTimeoutSeconds(),
});

console.log(`[api] listening on http://localhost:${port} (bind: ${host})`);
