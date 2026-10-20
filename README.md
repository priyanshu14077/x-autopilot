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
