export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const TOKEN_KEY = "devchat.token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* stockage indisponible : la session durera le temps de l'onglet */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* rien à faire */
  }
}

const NEXT_KEY = "devchat.next";

/** Mémorise la page à rouvrir après la connexion (par exemple un lien d'invitation). */
export function rememberNext(path: string) {
  try {
    window.sessionStorage.setItem(NEXT_KEY, path);
  } catch {
    /* rien à faire */
  }
}

/** Page à ouvrir juste après la connexion. */
export function takeNext(): string {
  try {
    const next = window.sessionStorage.getItem(NEXT_KEY);
    window.sessionStorage.removeItem(NEXT_KEY);
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  } catch {
    /* rien à faire */
  }
  return "/chat";
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Appel à l'API avec le jeton de session. Lève ApiError avec le message du serveur en cas d'échec. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("Impossible de joindre le serveur. Vérifie qu'il est lancé.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? `Erreur ${res.status}`, res.status);
  }
  return data as T;
}
