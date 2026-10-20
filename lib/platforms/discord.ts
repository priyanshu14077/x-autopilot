import "server-only";
import { AppError } from "../errors";
import { getConnection } from "../store";
import { json, send, statusError } from "./http";
import type { Publisher } from "./types";

const LABEL = "Discord";
const WEBHOOK_RE = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export const discord: Publisher = {
  async connect(input) {
    const webhookUrl = input.webhookUrl?.trim() ?? "";
    if (!WEBHOOK_RE.test(webhookUrl)) throw new AppError(400, "That doesn't look like a Discord webhook URL.");
    const res = await send(webhookUrl, { method: "GET" }, { label: LABEL });
    if (!res.ok) throw statusError({ label: LABEL }, res.status);
    const info = await json<{ name?: string; guild_id?: string; channel_id?: string }>(res);
    return {
      account: info?.name ?? "Discord webhook",
      creds: { webhookUrl, guildId: info?.guild_id ?? "", channelId: info?.channel_id ?? "" },
    };
  },

  async publish(text) {
    const conn = getConnection("discord");
    if (!conn) throw new AppError(401, "Connect Discord first.");
    const { webhookUrl, guildId, channelId } = conn.creds;
    const opts = { label: LABEL, publishing: true };
    const res = await send(
      `${webhookUrl}?wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Empty parse list: generated text can never ping @everyone, @here or roles.
        body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
      },
      opts,
    );
    if (!res.ok) throw statusError(opts, res.status);
    const id = (await json<{ id?: string }>(res))?.id;
    if (!id) throw new AppError(502, "Discord accepted the message but returned no ID. Check the channel.");
    return { id, url: guildId && channelId ? `https://discord.com/channels/${guildId}/${channelId}/${id}` : undefined };
  },
};
