import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "../errors";
import { getConnection } from "../store";
import { json, send, statusError } from "./http";
import type { Publisher } from "./types";

const LABEL = "Mastodon";

/** The instance URL is user-supplied and fetched server-side, so accept only plain https origins. */
function instanceOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new AppError(400, "Enter a valid instance URL, like https://mastodon.social.");
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password || url.port) {
    throw new AppError(400, "The instance must be a plain https:// address.");
  }
  return url.origin;
}

export const mastodon: Publisher = {
  async connect(input) {
    const origin = instanceOrigin(input.instanceUrl?.trim() ?? "");
    const accessToken = input.accessToken?.trim() ?? "";
    if (!accessToken) throw new AppError(400, "Access token is required.");
    const headers = { Authorization: `Bearer ${accessToken}` };

    const me = await send(`${origin}/api/v1/accounts/verify_credentials`, { headers }, { label: LABEL });
    if (!me.ok) throw statusError({ label: LABEL }, me.status);
    const acct = (await json<{ acct?: string }>(me))?.acct;

    // Instances can raise the 500-character default.
    const inst = await send(`${origin}/api/v2/instance`, { headers }, { label: LABEL }).catch(() => null);
    const max = (await json<{ configuration?: { statuses?: { max_characters?: number } } }>(inst ?? new Response()))
      ?.configuration?.statuses?.max_characters;

    return {
      account: `@${acct ?? "unknown"}@${new URL(origin).host}`,
      maxLength: typeof max === "number" && max > 0 ? max : undefined,
      creds: { origin, accessToken },
    };
  },

  async publish(text) {
    const conn = getConnection("mastodon");
    if (!conn) throw new AppError(401, "Connect Mastodon first.");
    const { origin, accessToken } = conn.creds;
    const opts = { label: LABEL, publishing: true };
    const res = await send(
      `${origin}/api/v1/statuses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({ status: text, visibility: "public" }),
      },
      opts,
    );
    if (!res.ok) throw statusError(opts, res.status);
    const post = await json<{ id?: string; url?: string }>(res);
    if (!post?.id) throw new AppError(502, "Mastodon accepted the post but returned no ID. Check your profile.");
    return { id: post.id, url: post.url };
  },
};
