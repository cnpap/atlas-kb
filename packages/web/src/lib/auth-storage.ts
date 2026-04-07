const AUTH_TOKEN_STORAGE_KEY = "knowledge.auth.token";
export const AUTH_EXPIRED_EVENT = "knowledge:auth-expired";

export function getAuthToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() || "";
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function notifyAuthExpired(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
