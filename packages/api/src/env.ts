const DEFAULT_API_PORT = 6112;
const DEFAULT_API_HOST = "0.0.0.0";
const DEFAULT_WEB_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "own209.test"];

function readCommaSeparatedValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getApiPort(): number {
  const port = Number(process.env.API_PORT ?? DEFAULT_API_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    return DEFAULT_API_PORT;
  }

  return port;
}

export function getApiHost(): string {
  const host = process.env.API_HOST?.trim();

  if (!host) {
    return DEFAULT_API_HOST;
  }

  return host;
}

export function getAllowedWebOrigins(): RegExp[] {
  const configuredHosts = readCommaSeparatedValues(
    process.env.WEB_ALLOWED_HOSTS,
  );
  const hosts = new Set([...DEFAULT_WEB_ALLOWED_HOSTS, ...configuredHosts]);

  return [...hosts].map(
    (host) => new RegExp(`^https?:\\/\\/${escapeRegExp(host)}(?::\\d+)?$`),
  );
}
