const DEFAULT_API_PORT = __ATLAS_KB_API_PORT__;

function getDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return `http://127.0.0.1:${DEFAULT_API_PORT}`;
  }

  return window.location.origin;
}

export function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;

  if (typeof baseUrl === "string" && baseUrl.trim().length > 0) {
    return baseUrl.trim();
  }

  return getDefaultApiBaseUrl();
}
