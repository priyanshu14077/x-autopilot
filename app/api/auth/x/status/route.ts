import { assertLocalDev } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { getSession } from "@/lib/session";


export async function GET() {
  try {
    assertLocalDev();
    const current = await getSession();
    if (!current) return Response.json({ connected: false });
    const { user, csrfToken } = current.session;
    return Response.json(
      { connected: true, user: { username: user.username, name: user.name }, csrfToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
