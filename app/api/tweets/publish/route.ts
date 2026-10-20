import { z } from "zod";
import { AppError, errorResponse } from "@/lib/errors";
import { assertSameOriginPost, safeEqual } from "@/lib/security";
import { getSession } from "@/lib/session";
import { MAX_TWEET_WEIGHT, tweetWeight } from "@/lib/tweet";
import { publishPost } from "@/lib/x";


const bodySchema = z.object({
  text: z
    .string()
    .refine((t) => t.trim().length > 0, "Post text is required.")
    .refine((t) => tweetWeight(t) <= MAX_TWEET_WEIGHT, "Post exceeds the X length limit."),
  confirm: z.literal(true, { error: "Publishing must be explicitly confirmed." }),
});

export async function POST(request: Request) {
  try {
    assertSameOriginPost(request);

    // Authentication/authorization comes from the server session + CSRF token,
    // never from anything in the body.
    const current = await getSession();
    if (!current) throw new AppError(401, "Connect your X account first.");
    const sent = request.headers.get("x-csrf-token") ?? "";
    if (!safeEqual(sent, current.session.csrfToken)) {
      throw new AppError(403, "Invalid CSRF token. Reload the page.");
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
    }
    const post = await publishPost(parsed.data.text);
    return Response.json(post, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
