import "server-only";
import { createHash } from "node:crypto";
import { xOAuthConfig } from "./env";
import { AppError } from "./errors";
import { getSession, type Session, type XTokens } from "./session";

// X API v2 + OAuth 2.0 (authorization code + PKCE, confidential client).
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
const API = "https://api.x.com/2";

export const REQUIRED_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

export const pkceChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

export function buildAuthorizeUrl(state: string, verifier: string) {
  const { clientId, callbackUrl } = xOAuthConfig();
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: REQUIRED_SCOPES.join(" "),
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function basicAuth() {
  const { clientId, clientSecret } = xOAuthConfig();
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<XTokens> {
  const { clientId } = xOAuthConfig();
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth(),
      },
      body: new URLSearchParams({ ...params, client_id: clientId }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new AppError(502, "Could not reach X. Try again.");
  }
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    console.error("[x] token request failed", res.status);
    throw new AppError(res.status === 400 || res.status === 401 ? 401 : 502, "X rejected the token request.");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (body.expires_in ?? 7200) * 1000,
    scope: body.scope ?? "",
  };
}

export const exchangeCode = (code: string, verifier: string) =>
  tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: xOAuthConfig().callbackUrl,
    code_verifier: verifier,
  });

export async function fetchMe(accessToken: string) {
  const res = await fetch(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as
    | { data?: { id: string; username: string; name: string } }
    | null;
  if (!res?.ok || !body?.data) throw new AppError(502, "Could not verify your X account.");
  return body.data;
}

export async function revokeToken(token: string, hint: "access_token" | "refresh_token") {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth(),
      },
      body: new URLSearchParams({ token, token_type_hint: hint }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best effort; local session is cleared regardless.
  }
}

// Refresh tokens rotate, so concurrent refreshes for one session must share a call.
const refreshing = new Map<string, Promise<XTokens>>();

async function validAccessToken(id: string, session: Session): Promise<string> {
  if (session.tokens.expiresAt - Date.now() > 60_000) return session.tokens.accessToken;
  if (!session.tokens.refreshToken) {
    throw new AppError(401, "X session expired. Reconnect your account.");
  }
  let p = refreshing.get(id);
  if (!p) {
    p = tokenRequest({ grant_type: "refresh_token", refresh_token: session.tokens.refreshToken }).finally(
      () => refreshing.delete(id),
    );
    refreshing.set(id, p);
  }
  try {
    const tokens = await p;
    session.tokens = { ...tokens, refreshToken: tokens.refreshToken ?? session.tokens.refreshToken };
    return session.tokens.accessToken;
  } catch {
    throw new AppError(401, "X session expired. Reconnect your account.");
  }
}

/** Publishes exactly `text`. Never retried: a failed request may still have posted. */
export async function publishPost(text: string) {
  const current = await getSession();
  if (!current) throw new AppError(401, "Connect your X account first.");
  const token = await validAccessToken(current.id, current.session);

  let res: Response;
  try {
    res = await fetch(`${API}/tweets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new AppError(
      502,
      "The request to X did not complete, so the post may or may not have been published. Check your X profile before trying again.",
    );
  }

  if (res.status === 201 || res.ok) {
    const body = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
    const id = body?.data?.id;
    if (!id) {
      throw new AppError(502, "X accepted the request but returned no post ID. Check your X profile.");
    }
    return { id, url: `https://x.com/${current.session.user.username}/status/${id}` };
  }

  const err = (await res.json().catch(() => null)) as { title?: string; detail?: string; type?: string } | null;
  console.error("[x] publish failed", res.status, err?.title ?? "", err?.detail ?? "");
  if (res.status === 402) {
    throw new AppError(402, "X rejected the post: your X API account has no credits or an inactive plan. Check the X Developer Portal billing.");
  }
  if (res.status === 401) throw new AppError(401, "X rejected the session. Reconnect your account.");
  if (res.status === 403) {
    throw new AppError(403, "X refused the post (duplicate content, missing write permission, or account restriction).");
  }
  if (res.status === 429) throw new AppError(429, "X rate limit reached. Try again later.");
  if (res.status >= 500) {
    throw new AppError(502, "X had a server error; the post may or may not have been published. Check your profile before retrying.");
  }
  throw new AppError(502, "X rejected the post.");
}
