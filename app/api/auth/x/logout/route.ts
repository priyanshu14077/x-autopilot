import { errorResponse } from "@/lib/errors";
import { assertSameOriginPost, safeEqual } from "@/lib/security";
import { destroySession, getSession } from "@/lib/session";
import { revokeToken } from "@/lib/x";


export async function POST(request: Request) {
  try {
    assertSameOriginPost(request);
    const current = await getSession();
    if (current) {
      const sent = request.headers.get("x-csrf-token") ?? "";
      if (!safeEqual(sent, current.session.csrfToken)) {
        return Response.json({ error: "Invalid CSRF token." }, { status: 403 });
      }
      const { accessToken, refreshToken } = current.session.tokens;
      await Promise.all([
        revokeToken(accessToken, "access_token"),
        refreshToken ? revokeToken(refreshToken, "refresh_token") : undefined,
      ]);
    }
    await destroySession();
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
