import { NextResponse } from "next/server";
import { assertLocalDev, xOAuthConfig } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { OAUTH_COOKIE, createSession, destroySession, takePending } from "@/lib/session";
import { safeEqual } from "@/lib/security";
import { REQUIRED_SCOPES, exchangeCode, fetchMe } from "@/lib/x";


export async function GET(request: Request) {
  let appUrl: string;
  try {
    assertLocalDev();
    appUrl = xOAuthConfig().appUrl;
  } catch (err) {
    return errorResponse(err);
  }

  const done = (code?: string) => {
    const url = new URL("/", appUrl);
    url.searchParams.set(code ? "x_error" : "x", code ?? "connected");
    const res = NextResponse.redirect(url);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${OAUTH_COOKIE}=`))
    ?.slice(OAUTH_COOKIE.length + 1);

  // Consume the pending record first so a state can never be replayed.
  const pending = state ? takePending(state) : undefined;
  if (!state || !cookieState || !safeEqual(state, cookieState) || !pending) {
    return done("invalid_state");
  }
  if (params.get("error")) {
    return done(params.get("error") === "access_denied" ? "access_denied" : "authorization_failed");
  }
  const code = params.get("code");
  if (!code) return done("authorization_failed");

  try {
    const tokens = await exchangeCode(code, pending.verifier);
    const granted = new Set(tokens.scope.split(/[\s,]+/));
    if (!REQUIRED_SCOPES.every((s) => granted.has(s))) {
      return done("insufficient_scopes");
    }
    const user = await fetchMe(tokens.accessToken);
    await destroySession(); // drop any prior session (fixation)
    await createSession({ tokens, user });
    return done();
  } catch {
    return done("exchange_failed");
  }
}
