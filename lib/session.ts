import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

// Tokens live only in this server process's memory, keyed by an opaque session ID
// held in an HTTP-only cookie. Restarting the dev server drops the connection.
// Stored on globalThis so dev-mode module reloads don't lose it.

export const SESSION_COOKIE = "xa_session";
export const OAUTH_COOKIE = "xa_oauth";
const SESSION_TTL_S = 60 * 60 * 24 * 7;

export type XTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  scope: string;
};

export type Session = {
  tokens: XTokens;
  user: { id: string; username: string; name: string };
  csrfToken: string;
  createdAt: number;
};

type PendingAuth = { verifier: string; createdAt: number };

const g = globalThis as unknown as {
  __xaSessions?: Map<string, Session>;
  __xaPending?: Map<string, PendingAuth>;
};
const sessions = (g.__xaSessions ??= new Map());
const pending = (g.__xaPending ??= new Map());

export const PENDING_TTL_MS = 10 * 60 * 1000;

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export const random = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function savePending(state: string, verifier: string) {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > PENDING_TTL_MS) pending.delete(k);
  pending.set(state, { verifier, createdAt: now });
}

/** Single-use: returns and removes the pending auth for this state. */
export function takePending(state: string): PendingAuth | undefined {
  const p = pending.get(state);
  pending.delete(state);
  if (!p || Date.now() - p.createdAt > PENDING_TTL_MS) return undefined;
  return p;
}

export async function createSession(data: Omit<Session, "csrfToken" | "createdAt">) {
  const id = random();
  sessions.set(id, { ...data, csrfToken: random(), createdAt: Date.now() });
  (await cookies()).set(SESSION_COOKIE, id, cookieOptions(SESSION_TTL_S));
  return id;
}

export async function getSession(): Promise<{ id: string; session: Session } | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_S * 1000) {
    sessions.delete(id);
    return null;
  }
  return { id, session };
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) sessions.delete(id);
  jar.delete(SESSION_COOKIE);
}
