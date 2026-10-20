import "server-only";
import { AppError } from "../errors";
import { getSession } from "../session";
import { listConnections } from "../store";
import { bluesky } from "./bluesky";
import { discord } from "./discord";
import { mastodon } from "./mastodon";
import { PLATFORMS, isPlatformId, type PlatformId } from "./meta";
import { telegram } from "./telegram";
import type { Publisher } from "./types";
import { x } from "./x";

const publishers: Record<PlatformId, Publisher> = { x, telegram, discord, bluesky, mastodon };

export function parsePlatform(value: string): PlatformId {
  if (!isPlatformId(value)) throw new AppError(404, "Unknown platform.");
  return value;
}

export const getPublisher = (id: PlatformId) => publishers[id];

export type AccountInfo = { account: string; maxLength?: number };

/** Connected-account summaries for every platform; null where not connected. Never includes secrets. */
export async function accounts(): Promise<Record<PlatformId, AccountInfo | null>> {
  const stored = listConnections();
  const session = await getSession();
  const out = {} as Record<PlatformId, AccountInfo | null>;
  for (const id of Object.keys(PLATFORMS) as PlatformId[]) {
    out[id] =
      id === "x"
        ? session
          ? { account: `@${session.session.user.username}` }
          : null
        : (stored.get(id) ?? null);
  }
  return out;
}

export async function effectiveLimit(id: PlatformId): Promise<number> {
  const info = (await accounts())[id];
  return info?.maxLength ?? PLATFORMS[id].limit;
}
