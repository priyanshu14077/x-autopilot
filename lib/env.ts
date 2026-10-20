import "server-only";
import { AppError } from "./errors";

function required(name: string, hint?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError(503, hint ?? `Server is missing the ${name} setting.`);
  }
  return value;
}

/** Groq is used when GROQ_API_KEY is set; otherwise xAI. */
export function llmConfig():
  | { provider: "groq" | "xai"; apiKey: string; model: string } {
  if (process.env.GROQ_API_KEY?.trim()) {
    return {
      provider: "groq",
      apiKey: required("GROQ_API_KEY"),
      model: required(
        "GROQ_MODEL",
        "GROQ_MODEL is not set. Add a model ID from https://console.groq.com/docs/models to .env.local and restart the dev server.",
      ),
    };
  }
  return {
    provider: "xai",
    apiKey: required("XAI_API_KEY"),
    model: required(
      "XAI_MODEL",
      "XAI_MODEL is not set. Add a model ID your xAI account can use (see https://console.x.ai) to .env.local and restart the dev server.",
    ),
  };
}

export function xOAuthConfig() {
  const callbackUrl = required("X_CALLBACK_URL");
  return {
    clientId: required("X_CLIENT_ID"),
    clientSecret: required("X_CLIENT_SECRET"),
    callbackUrl,
    appUrl: process.env.APP_URL?.trim() || new URL(callbackUrl).origin,
  };
}

export function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const v of [process.env.APP_URL, process.env.X_CALLBACK_URL]) {
    if (!v) continue;
    try {
      origins.add(new URL(v).origin);
    } catch {}
  }
  return origins;
}

/** This initial version is local-development only. */
export function assertLocalDev() {
  if (process.env.NODE_ENV === "production") {
    throw new AppError(403, "This app is restricted to local development.");
  }
}
