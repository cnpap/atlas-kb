import { fileURLToPath, URL } from "node:url";
import { vueJumpPlugin } from "@cnpap/vue-jump";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import ui from "@nuxt/ui/vite";

const DEFAULT_WEB_PORT = 6111;
const DEFAULT_API_PORT = 6112;
const DEFAULT_ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "own209.test",
  "atlas-kb.apitype.com",
];

function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value ?? fallback);

  if (!Number.isInteger(port) || port <= 0) {
    return fallback;
  }

  return port;
}

function readString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return undefined;
  }

  return normalizedValue;
}

function readAllowedHosts(
  value: string | undefined,
  fallback: string[],
): string[] {
  const allowedHosts = value
    ?.split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);

  if (!allowedHosts || allowedHosts.length === 0) {
    return fallback;
  }

  return [...new Set([...fallback, ...allowedHosts])];
}

const webPort = readPort(process.env.WEB_PORT, DEFAULT_WEB_PORT);
const apiPort = readPort(process.env.API_PORT, DEFAULT_API_PORT);
const allowedHosts = readAllowedHosts(
  process.env.WEB_ALLOWED_HOSTS,
  DEFAULT_ALLOWED_HOSTS,
);
const apiProxyTarget =
  readString(process.env.VITE_API_PROXY_TARGET) ??
  `http://127.0.0.1:${apiPort}`;
const apiProxy = {
  "/api": {
    target: apiProxyTarget,
    changeOrigin: true,
  },
};

export default defineConfig({
  define: {
    __ATLAS_KB_API_PORT__: JSON.stringify(String(apiPort)),
  },
  plugins: [
    vueJumpPlugin(),
    vue(),
    ui({
      ui: {
        colors: {
          primary: "green",
          neutral: "zinc",
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    allowedHosts,
    host: "0.0.0.0",
    port: webPort,
    proxy: apiProxy,
    strictPort: true,
  },
  preview: {
    allowedHosts,
    host: "0.0.0.0",
    port: webPort,
    proxy: apiProxy,
    strictPort: true,
  },
});
