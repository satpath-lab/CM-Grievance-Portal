const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("token");
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => req<T>("GET", path),
  post: <T>(path: string, body: unknown) => req<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => req<T>("PATCH", path, body),
  delete: <T>(path: string) => req<T>("DELETE", path),
};

export function setToken(t: string) {
  if (typeof window !== "undefined") window.localStorage.setItem("token", t);
}

export function clearToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem("token");
}

export function getStoredUser(): null | { id: string; name: string; role: string; preferredLanguage: string } {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: object) {
  if (typeof window !== "undefined") window.localStorage.setItem("user", JSON.stringify(user));
}

/**
 * Reads the permissions array out of the JWT payload directly. JWTs are
 * signed, not encrypted — anyone can read the payload (that's normal and
 * expected), so decoding it client-side just to decide which tabs to
 * show is fine; it's not a security boundary, the server-side
 * requirePermission checks are. Avoids a round-trip to /auth/me just to
 * find out which tabs to render.
 */
export function getStoredPermissions(): string[] {
  const token = getToken();
  if (!token) return [];
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.permissions || [];
  } catch {
    return [];
  }
}
