# x-autopilot

Local-first dashboard that drafts X posts with an LLM (Groq or xAI Grok), lets you edit them, and publishes to your account via OAuth 2.0 with explicit confirmation.

> Status: early development. Runs on local development only.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, Vercel AI SDK, Zod.

## Getting started

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3000 (use `127.0.0.1`, not `localhost`, to match the registered OAuth callback).

## Platforms

Each platform has its own draft; you publish one platform at a time.

| Platform | Connect with | Notes |
|---|---|---|
| Telegram | Bot token + channel | Free. Add the bot to the channel as an admin. |
| Discord | Webhook URL | Free. Mentions are always disabled. |
| Bluesky | Handle + app password | Free. 300 graphemes. |
| Mastodon | Instance URL + access token | Free. Limit read from the instance. |
| X | OAuth 2.0 (PKCE) | Posting needs X API credits or a paid plan. |

Credentials for the first four are checked with the platform, then stored encrypted (AES-256-GCM) in `.data/` (git-ignored). The key is `APP_SECRET` (base64, 32 bytes) if set, otherwise a generated `.data/secret.key`. X tokens stay in server memory.

## API (v1)

All state-changing calls need a same-origin JSON request and the `x-csrf-token` value returned by `GET /api/v1/platforms`.

- `GET /api/v1/platforms`: platforms, limits, connection state
- `POST /api/v1/platforms/{id}/connection`: connect (credentials in body)
- `DELETE /api/v1/platforms/{id}/connection`: disconnect
- `POST /api/v1/generate`: `{ platform, topic }`
- `POST /api/v1/publish`: `{ platform, text, confirm: true }`

The X OAuth routes stay at `/api/auth/x/{login,callback}` because the callback URL is registered with X.

## Configuration

Create `.env.local` (never commit it):

```
GROQ_API_KEY=
GROQ_MODEL=
# or, instead of Groq:
XAI_API_KEY=
XAI_MODEL=

X_CLIENT_ID=
X_CLIENT_SECRET=
X_CALLBACK_URL=http://127.0.0.1:3000/api/auth/x/callback
APP_URL=http://127.0.0.1:3000
```

Register the same callback URL in the X Developer Portal (OAuth 2.0, confidential client, read and write permissions).
