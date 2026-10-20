import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { AppError } from "./errors";
import { allowedOrigins, assertLocalDev } from "./env";

/** Guard for state-changing requests: local-only, same-origin, JSON content. */
export function assertSameOriginPost(request: Request) {
  assertLocalDev();
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins().has(origin)) {
    throw new AppError(403, "Request origin not allowed.");
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new AppError(415, "Expected application/json.");
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const CSRF_COOKIE = "xa_csrf";

/** Returns this browser's CSRF token, creating the cookie on first use (double-submit pattern). */
export async function issueCsrfToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CSRF_COOKIE)?.value;
  if (existing) return existing;
  const token = randomBytes(32).toString("base64url");
  jar.set(CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return token;
}

/** Guard for every state-changing v1 request: local-only, same-origin JSON, and a matching CSRF token. */
export async function assertApiPost(request: Request) {
  assertSameOriginPost(request);
  const cookie = (await cookies()).get(CSRF_COOKIE)?.value;
  const header = request.headers.get("x-csrf-token");
  if (!cookie || !header || !safeEqual(cookie, header)) {
    throw new AppError(403, "Invalid CSRF token. Reload the page.");
  }
}
