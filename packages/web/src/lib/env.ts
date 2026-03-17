const DEFAULT_API_BASE_URL = "http://localhost:3001";

export function getApiBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;

  if (typeof baseUrl === "string" && baseUrl.trim().length > 0) {
    return baseUrl.trim();
  }

  return DEFAULT_API_BASE_URL;
}
