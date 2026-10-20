import "server-only";
import { AppError } from "../errors";
import { getConnection } from "../store";
import { json, send, statusError } from "./http";
import type { Publisher } from "./types";

const LABEL = "Telegram";
const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

type Reply<T> = { ok: boolean; result?: T };

export const telegram: Publisher = {
  async connect(input) {
    const token = input.token?.trim() ?? "";
    const chatId = input.chatId?.trim() ?? "";
    if (!/^\d+:[\w-]+$/.test(token)) throw new AppError(400, "That doesn't look like a Telegram bot token.");
    if (!/^(@[A-Za-z]\w{3,}|-?\d+)$/.test(chatId)) {
      throw new AppError(400, "Channel must be @username or a numeric chat ID.");
    }
    const post = (method: string, body: object) =>
      send(api(token, method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, { label: LABEL });

    const me = await post("getMe", {});
    if (!me.ok) throw statusError({ label: LABEL }, me.status);
    const chatRes = await post("getChat", { chat_id: chatId });
    if (!chatRes.ok) {
      throw new AppError(400, "Telegram can't see that chat. Add the bot to the channel as an admin and check the name.");
    }
    const chat = (await json<Reply<{ username?: string; title?: string }>>(chatRes))?.result;
    const username = chat?.username;
    return {
      account: username ? `@${username}` : (chat?.title ?? chatId),
      creds: { token, chatId, ...(username ? { username } : {}) },
    };
  },

  async publish(text) {
    const conn = getConnection("telegram");
    if (!conn) throw new AppError(401, "Connect Telegram first.");
    const { token, chatId, username } = conn.creds;
    const opts = { label: LABEL, publishing: true };
    const res = await send(
      api(token, "sendMessage"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }), // no parse_mode: plain text only
      },
      opts,
    );
    if (!res.ok) throw statusError(opts, res.status);
    const id = (await json<Reply<{ message_id: number }>>(res))?.result?.message_id;
    if (id === undefined) throw new AppError(502, "Telegram accepted the message but returned no ID. Check the channel.");
    return { id: String(id), url: username ? `https://t.me/${username}/${id}` : undefined };
  },
};
