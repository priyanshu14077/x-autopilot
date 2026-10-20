import { NextResponse } from "next/server";
import { assertLocalDev } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { OAUTH_COOKIE, PENDING_TTL_MS, cookieOptions, random, savePending } from "@/lib/session";
import { buildAuthorizeUrl } from "@/lib/x";


export async function GET() {
  try {
    assertLocalDev();
    const state = random(24);
    const verifier = random(48); // 64 chars, within PKCE's 43-128
    savePending(state, verifier);
    const res = NextResponse.redirect(buildAuthorizeUrl(state, verifier));
    // Binds the flow to this browser (login-CSRF protection).
    res.cookies.set(OAUTH_COOKIE, state, cookieOptions(PENDING_TTL_MS / 1000));
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
