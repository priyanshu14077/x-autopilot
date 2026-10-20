import "server-only";
import { AppError } from "../errors";

type SendOptions = {
  label: string;
  /** True for the request that creates the post: a failure may still have published it. */
  publishing?: boolean;
};

const AMBIGUOUS = (label: string) =>
  `The request to ${label} did not complete, so the post may or may not have been published. Check ${label} before trying again.`;

/** fetch with a timeout, translating network failures into safe errors. Never logs URLs (they can hold tokens). */
export async function send(url: string, init: RequestInit, { label, publishing }: SendOptions) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch {
    throw new AppError(502, publishing ? AMBIGUOUS(label) : `Could not reach ${label}.`);
  }
}

export const json = <T>(res: Response) => res.json().catch(() => null) as Promise<T | null>;

export function statusError({ label, publishing }: SendOptions, status: number): AppError {
  console.error(`[${label}] request failed`, status);
  if (status === 401 || status === 403) {
    return new AppError(status, `${label} refused the request. Check the credentials and permissions, then reconnect.`);
  }
  if (status === 429) return new AppError(429, `${label} rate limit reached. Try again later.`);
  if (status >= 500) {
    return new AppError(502, publishing ? AMBIGUOUS(label) : `${label} had a server error. Try again.`);
  }
  return new AppError(502, `${label} rejected the request.`);
}
