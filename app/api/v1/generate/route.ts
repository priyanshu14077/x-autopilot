import { z } from "zod";
import { AppError, errorResponse } from "@/lib/errors";
import { generatePost, topicSchema } from "@/lib/generate";
import { effectiveLimit, parsePlatform } from "@/lib/platforms";
import { measure } from "@/lib/platforms/meta";
import { assertApiPost } from "@/lib/security";

const bodySchema = z.object({ platform: z.string(), topic: topicSchema });

export async function POST(request: Request) {
  try {
    await assertApiPost(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
    }
    const platform = parsePlatform(parsed.data.platform);
    const limit = await effectiveLimit(platform);
    const text = await generatePost(parsed.data.topic, platform, limit);
    return Response.json({ platform, text, length: measure(platform, text), limit });
  } catch (err) {
    return errorResponse(err);
  }
}
