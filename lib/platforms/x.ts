import "server-only";
import { disconnectX, publishPost } from "../x";
import type { Publisher } from "./types";

// X connects through the OAuth routes under /api/auth/x (the callback URL is registered
// with X, so those paths are not versioned). Tokens live in the server session, not the store.
export const x: Publisher = {
  publish: publishPost,
  disconnect: disconnectX,
};
