import { computed, readonly, ref } from "vue";
import type { LoginRequest, LoginResult, Session } from "@atlas-kb/schema";
import {
  fetchCurrentSessionRequest,
  getErrorMessage,
  loginRequest,
} from "./api-client";
import {
  AUTH_EXPIRED_EVENT,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from "./auth-storage";

const sessionRef = ref<Session | null>(null);
const initializedRef = ref(false);
const pendingRef = ref(false);

let initPromise: Promise<Session | null> | null = null;
let authEventBound = false;

function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname === "/login") {
    return;
  }

  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`/login?next=${encodeURIComponent(next || "/app")}`);
}

function setSession(session: Session | null): void {
  sessionRef.value = session;
  initializedRef.value = true;
}

function bindAuthEvent(): void {
  if (authEventBound || typeof window === "undefined") {
    return;
  }

  window.addEventListener(AUTH_EXPIRED_EVENT, () => {
    clearAuthToken();
    setSession(null);
    pendingRef.value = false;
    redirectToLogin();
  });

  authEventBound = true;
}

export async function initializeAuthSession(): Promise<Session | null> {
  bindAuthEvent();

  if (initializedRef.value) {
    return sessionRef.value;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const token = getAuthToken();

    if (!token) {
      setSession(null);
      return null;
    }

    pendingRef.value = true;

    try {
      const session = await fetchCurrentSessionRequest();
      setSession(session);
      return session;
    } catch {
      clearAuthToken();
      setSession(null);
      return null;
    } finally {
      pendingRef.value = false;
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function loginWithPassword(
  input: LoginRequest,
): Promise<LoginResult> {
  bindAuthEvent();
  pendingRef.value = true;

  try {
    const result = await loginRequest(input);
    setAuthToken(result.token);
    setSession({
      user: result.user,
      expiresAt: result.expiresAt,
    });
    return result;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  } finally {
    pendingRef.value = false;
  }
}

export function logout(): void {
  clearAuthToken();
  setSession(null);
}

export function useAuthSession() {
  bindAuthEvent();

  return {
    session: readonly(sessionRef),
    currentUser: computed(() => sessionRef.value?.user ?? null),
    isAuthenticated: computed(() => Boolean(sessionRef.value)),
    initialized: readonly(initializedRef),
    pending: readonly(pendingRef),
  };
}
