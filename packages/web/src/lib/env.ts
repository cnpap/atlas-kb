const DEFAULT_API_PORT = __ATLAS_KB_API_PORT__;

function getDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return `http://localhost:${DEFAULT_API_PORT}`;
  }

  const url = new URL(window.location.origin);
  url.port = DEFAULT_API_PORT;
  return url.origin;
}

export function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;

  if (typeof baseUrl === "string" && baseUrl.trim().length > 0) {
    return baseUrl.trim();
  }

  return getDefaultApiBaseUrl();
}
