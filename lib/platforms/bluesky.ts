import "server-only";
import { AppError } from "../errors";
import { getConnection } from "../store";
import { json, send, statusError } from "./http";
import type { Publisher } from "./types";

const LABEL = "Bluesky";
const SERVICE = "https://bsky.social/xrpc";

type Session = { accessJwt: string; did: string; handle: string };

async function createSession(identifier: string, password: string): Promise<Session> {
  const res = await send(
    `${SERVICE}/com.atproto.server.createSession`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) },
    { label: LABEL },
  );
  const body = await json<Session>(res);
  if (res.status === 401 || res.status === 400) {
    throw new AppError(401, "Bluesky rejected the handle or app password.");
  }
  if (!res.ok || !body?.accessJwt) throw statusError({ label: LABEL }, res.status);
  return body;
}

export const bluesky: Publisher = {
  async connect(input) {
    const identifier = input.identifier?.trim().replace(/^@/, "") ?? "";
    const appPassword = input.appPassword?.trim() ?? "";
    if (!identifier || !appPassword) throw new AppError(400, "Handle and app password are required.");
    const session = await createSession(identifier, appPassword);
    return { account: `@${session.handle}`, creds: { identifier, appPassword } };
  },

  async publish(text) {
    const conn = getConnection("bluesky");
    if (!conn) throw new AppError(401, "Connect Bluesky first.");
    const session = await createSession(conn.creds.identifier, conn.creds.appPassword);
    const opts = { label: LABEL, publishing: true };
    const res = await send(
      `${SERVICE}/com.atproto.repo.createRecord`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessJwt}` },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.post",
          record: { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString() },
        }),
      },
      opts,
    );
    if (!res.ok) throw statusError(opts, res.status);
    const uri = (await json<{ uri?: string }>(res))?.uri;
    const rkey = uri?.split("/").pop();
    if (!rkey) throw new AppError(502, "Bluesky accepted the post but returned no ID. Check your profile.");
    return { id: rkey, url: `https://bsky.app/profile/${session.handle}/post/${rkey}` };
  },
};
