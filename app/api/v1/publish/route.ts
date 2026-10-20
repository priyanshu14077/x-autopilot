import { z } from "zod";
import { AppError, errorResponse } from "@/lib/errors";
import { accounts, effectiveLimit, getPublisher, parsePlatform } from "@/lib/platforms";
import { measure } from "@/lib/platforms/meta";
import { assertApiPost } from "@/lib/security";

const bodySchema = z.object({
  platform: z.string(),
  text: z.string().refine((t) => t.trim().length > 0, "Post text is required."),
  confirm: z.literal(true, { error: "Publishing must be explicitly confirmed." }),
});

/** Publishes to one platform. Authorization comes from the server-side connection and CSRF token, never from the body. */
export async function POST(request: Request) {
  try {
    await assertApiPost(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
    }
    const platform = parsePlatform(parsed.data.platform);
    if (!(await accounts())[platform]) throw new AppError(401, "Connect this platform first.");
    if (measure(platform, parsed.data.text) > (await effectiveLimit(platform))) {
      throw new AppError(400, "Post exceeds this platform's length limit.");
    }
    const result = await getPublisher(platform).publish(parsed.data.text);
    return Response.json({ platform, ...result }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
