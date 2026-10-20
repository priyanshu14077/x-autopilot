import { z } from "zod";
import { generateTweet, topicSchema } from "@/lib/grok";
import { AppError, errorResponse } from "@/lib/errors";
import { assertSameOriginPost } from "@/lib/security";


const bodySchema = z.object({ topic: topicSchema });

export async function POST(request: Request) {
  try {
    assertSameOriginPost(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
    }
    const tweet = await generateTweet(parsed.data.topic);
    return Response.json({ tweet });
  } catch (err) {
    return errorResponse(err);
  }
}
