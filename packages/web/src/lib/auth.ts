import type { LoginResult, Session } from "@atlas-kb/schema";
import { computed, ref } from "vue";

const TOKEN_STORAGE_KEY = "atlas-kb.token";
const SESSION_STORAGE_KEY = "atlas-kb.session";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readStoredToken(): string {
  if (!isBrowser()) {
    return "";
  }
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

function readStoredSession(): Session | null {
  if (!isBrowser()) {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function writeStoredToken(token: string): void {
  if (!isBrowser()) return;
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return;
  }
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function writeStoredSession(session: Session | null): void {
  if (!isBrowser()) return;
  if (session) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return;
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

const authToken = ref(readStoredToken());
const authSession = ref<Session | null>(readStoredSession());

export const isAuthenticated = computed(() => authToken.value.length > 0);

export function getAuthToken(): string {
  return authToken.value;
}

export function hasAuthToken(): boolean {
  return getAuthToken().length > 0;
}

export function useAuthState() {
  return {
    authSession,
    authToken,
    isAuthenticated,
  };
}

export function setLoginSession(session: LoginResult): void {
  authToken.value = session.token;
  authSession.value = {
    expiresAt: session.expiresAt,
    user: session.user,
  };
  writeStoredToken(authToken.value);
  writeStoredSession(authSession.value);
}

export function replaceSession(session: Session): void {
  authSession.value = session;
  writeStoredSession(session);
}

export function clearAuthSession(): void {
  authToken.value = "";
  authSession.value = null;
  writeStoredToken("");
  writeStoredSession(null);
}
