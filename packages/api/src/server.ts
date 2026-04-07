import { createApp } from "./app";
import { getApiHost, getApiPort } from "./env";

const host = getApiHost();
const port = getApiPort();
const API_IDLE_TIMEOUT_SECONDS = 120;
const app = createApp();

app.listen({
  hostname: host,
  port,
  idleTimeout: API_IDLE_TIMEOUT_SECONDS,
});

console.log(`[api] listening on http://localhost:${port} (bind: ${host})`);
