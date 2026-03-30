const DEFAULT_API_PORT = __ATLAS_KB_API_PORT__;

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function getDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return `http://127.0.0.1:${DEFAULT_API_PORT}`;
  }

  return window.location.origin;
}

function resolveConfiguredApiBaseUrl(value: string): string | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  if (isAbsoluteHttpUrl(normalized)) {
    return normalized;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  return new URL(normalized, window.location.origin).toString();
}

export function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;

  if (typeof baseUrl === "string") {
    const resolvedBaseUrl = resolveConfiguredApiBaseUrl(baseUrl);

    if (resolvedBaseUrl) {
      return resolvedBaseUrl;
    }
  }

  return getDefaultApiBaseUrl();
}
