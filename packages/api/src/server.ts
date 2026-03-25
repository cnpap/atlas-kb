import { createApp } from "./app";
import { getApiHost, getApiPort } from "./env";

const host = getApiHost();
const port = getApiPort();
const app = createApp();

app.listen({ hostname: host, port });

console.log(
  `[atlas-kb/api] listening on http://localhost:${port} (bind: ${host})`,
);
