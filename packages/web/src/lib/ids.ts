export function generateClientId(prefix?: string): string {
  const randomUUID = globalThis.crypto?.randomUUID;

  if (typeof randomUUID === "function") {
    const id = randomUUID.call(globalThis.crypto);
    return prefix ? `${prefix}:${id}` : id;
  }

  const fallback = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}:${fallback}` : fallback;
}
