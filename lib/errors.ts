export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly safeMessage: string,
  ) {
    super(safeMessage);
  }
}

export function errorResponse(err: unknown, fallback = "Something went wrong.") {
  if (err instanceof AppError) {
    return Response.json({ error: err.safeMessage }, { status: err.status });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
