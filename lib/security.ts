import "server-only";
import { timingSafeEqual } from "node:crypto";
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
