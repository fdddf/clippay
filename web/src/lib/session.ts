// The signed-in session (see verifier/src/session.ts), kept in localStorage so
// the landing page can tell a returning user without loading wallet code.

export const SESSION_KEY = "clippay.session";

export interface StoredSession {
  token: string;
  address: string;
  /** Unix seconds. */
  expires: number;
}

export function storedSession(): StoredSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as StoredSession | null;
    return s && s.expires > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}
