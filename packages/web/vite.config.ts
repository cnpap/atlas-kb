import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import ui from "@nuxt/ui/vite";

const DEFAULT_WEB_PORT = 6111;
const DEFAULT_API_PORT = 6112;

function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value ?? fallback);

  if (!Number.isInteger(port) || port <= 0) {
    return fallback;
  }

  return port;
}

const webPort = readPort(process.env.WEB_PORT, DEFAULT_WEB_PORT);
const apiPort = readPort(process.env.API_PORT, DEFAULT_API_PORT);

export default defineConfig({
  define: {
    __ATLAS_KB_API_PORT__: JSON.stringify(String(apiPort)),
  },
  plugins: [
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
    host: "0.0.0.0",
    port: webPort,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: webPort,
    strictPort: true,
  },
});
