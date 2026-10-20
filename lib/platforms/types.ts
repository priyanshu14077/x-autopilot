import type { Connection } from "../store";

export type PublishResult = { id: string; url?: string };

export interface Publisher {
  /** Checks the submitted credentials with the platform and returns what to store. */
  connect?(input: Record<string, string>): Promise<Connection>;
  /** Publishes exactly `text`. Must not retry: a failed request may still have posted. */
  publish(text: string): Promise<PublishResult>;
  /** Revokes remote access where the platform supports it. Local data is removed by the caller. */
  disconnect?(): Promise<void>;
}
