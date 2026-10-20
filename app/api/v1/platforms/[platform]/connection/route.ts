import { z } from "zod";
import { AppError, errorResponse } from "@/lib/errors";
import { getPublisher, parsePlatform } from "@/lib/platforms";
import { PLATFORMS } from "@/lib/platforms/meta";
import { assertApiPost } from "@/lib/security";
import { deleteConnection, saveConnection } from "@/lib/store";

type Context = { params: Promise<{ platform: string }> };

const bodySchema = z.record(z.string(), z.string().max(2000));

/** Validates the submitted credentials with the platform, then stores them encrypted. */
export async function POST(request: Request, { params }: Context) {
  try {
    await assertApiPost(request);
    const id = parsePlatform((await params).platform);
    const publisher = getPublisher(id);
    if (!publisher.connect) {
      throw new AppError(400, `${PLATFORMS[id].label} connects through its sign-in flow, not this endpoint.`);
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError(400, "Invalid request.");

    const allowed = new Set(PLATFORMS[id].fields?.map((f) => f.name));
    const input = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => allowed.has(k)));
    const connection = await publisher.connect(input);
    saveConnection(id, connection);
    return Response.json({ connected: true, account: connection.account, limit: connection.maxLength ?? PLATFORMS[id].limit });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    await assertApiPost(request);
    const id = parsePlatform((await params).platform);
    await getPublisher(id).disconnect?.();
    if (id !== "x") deleteConnection(id);
    return Response.json({ connected: false });
  } catch (err) {
    return errorResponse(err);
  }
}
