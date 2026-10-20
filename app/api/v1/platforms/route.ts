import { assertLocalDev } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { accounts } from "@/lib/platforms";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/meta";
import { issueCsrfToken } from "@/lib/security";

export async function GET() {
  try {
    assertLocalDev();
    const [connected, csrfToken] = await Promise.all([accounts(), issueCsrfToken()]);
    const platforms = (Object.keys(PLATFORMS) as PlatformId[]).map((id) => {
      const meta = PLATFORMS[id];
      const info = connected[id];
      return {
        id,
        label: meta.label,
        limit: info?.maxLength ?? meta.limit,
        fields: meta.fields,
        help: meta.help,
        oauth: meta.fields === null,
        connected: info !== null,
        account: info?.account ?? null,
      };
    });
    return Response.json({ csrfToken, platforms }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
