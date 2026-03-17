import { createApp } from "./app";
import { getApiPort } from "./env";

const port = getApiPort();
const app = createApp();

app.listen(port);

console.log(`[atlas-kb/api] listening on http://localhost:${port}`);
