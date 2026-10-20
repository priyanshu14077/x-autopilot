import { tweetWeight } from "../tweet";

// Client-safe platform metadata and length rules (no credentials, no server imports).

export const PLATFORM_IDS = ["x", "telegram", "discord", "bluesky", "mastodon"] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export type FieldDef = {
  name: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
};

export type PlatformMeta = {
  id: PlatformId;
  label: string;
  /** Hard limit enforced before publishing. May be overridden per connection (Mastodon). */
  limit: number;
  /** Length the model is asked to stay under; shorter than `limit` where long posts read badly. */
  targetMax: number;
  /** Writing guidance appended to the generation prompt. */
  style: string;
  /** Fields the user fills in to connect; null means connect through OAuth. */
  fields: FieldDef[] | null;
  help: string;
};

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  x: {
    id: "x",
    label: "X",
    limit: 280,
    targetMax: 270,
    style: "A single punchy post. At most one hashtag, only if natural.",
    fields: null,
    help: "Posting through the X API is paid; you need credits or an active plan.",
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    limit: 4096,
    targetMax: 700,
    style: "A channel update in plain text. Short paragraphs are fine. No markdown or hashtags.",
    fields: [
      { name: "token", label: "Bot token", secret: true, placeholder: "123456:ABC-DEF…" },
      { name: "chatId", label: "Channel or chat", placeholder: "@mychannel or -1001234567890" },
    ],
    help: "Create a bot with @BotFather, then add it to your channel as an admin that can post.",
  },
  discord: {
    id: "discord",
    label: "Discord",
    limit: 2000,
    targetMax: 600,
    style: "A conversational channel message. Plain text; no @everyone or @here mentions.",
    fields: [
      {
        name: "webhookUrl",
        label: "Webhook URL",
        secret: true,
        placeholder: "https://discord.com/api/webhooks/…",
      },
    ],
    help: "Channel settings → Integrations → Webhooks → New Webhook → Copy URL.",
  },
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    limit: 300,
    targetMax: 280,
    style: "A single concise post in a conversational tone. Hashtags are rarely used here.",
    fields: [
      { name: "identifier", label: "Handle", placeholder: "you.bsky.social" },
      { name: "appPassword", label: "App password", secret: true, placeholder: "xxxx-xxxx-xxxx-xxxx" },
    ],
    help: "Settings → Privacy and security → App passwords. Never use your main password.",
  },
  mastodon: {
    id: "mastodon",
    label: "Mastodon",
    limit: 500,
    targetMax: 450,
    style: "A single post in a conversational tone. Hashtags are common and useful here, but keep them to two at most.",
    fields: [
      { name: "instanceUrl", label: "Instance URL", placeholder: "https://mastodon.social" },
      { name: "accessToken", label: "Access token", secret: true },
    ],
    help: "Preferences → Development → New application with the write:statuses scope; copy the access token.",
  },
};

const segmenter = new Intl.Segmenter();

/** Length of `text` as the platform counts it (approximation for URL handling). */
export function measure(platform: PlatformId, text: string): number {
  switch (platform) {
    case "x":
      return tweetWeight(text);
    case "bluesky":
      return [...segmenter.segment(text)].length; // graphemes
    default:
      return [...text].length; // code points
  }
}

export function isPlatformId(value: string): value is PlatformId {
  return (PLATFORM_IDS as readonly string[]).includes(value);
}
