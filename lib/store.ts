import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, decrypt, encrypt } from "./secret";
import type { PlatformId } from "./platforms/meta";

export type Connection = {
  account: string;
  /** Per-connection post length limit, when the platform reports one. */
  maxLength?: number;
  creds: Record<string, string>;
};

const g = globalThis as unknown as { __xaDb?: Database.Database };

function db(): Database.Database {
  if (!g.__xaDb) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    const d = new Database(path.join(DATA_DIR, "autopilot.db"));
    d.pragma("journal_mode = WAL");
    d.exec(`CREATE TABLE IF NOT EXISTS connections (
      platform   TEXT PRIMARY KEY,
      account    TEXT NOT NULL,
      max_length INTEGER,
      secret     TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    g.__xaDb = d;
  }
  return g.__xaDb;
}

type Row = { platform: string; account: string; max_length: number | null; secret: string };

export function saveConnection(platform: PlatformId, c: Connection) {
  db()
    .prepare(
      `INSERT INTO connections (platform, account, max_length, secret, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(platform) DO UPDATE SET
         account = excluded.account, max_length = excluded.max_length,
         secret = excluded.secret, updated_at = excluded.updated_at`,
    )
    .run(platform, c.account, c.maxLength ?? null, encrypt(JSON.stringify(c.creds)), Date.now());
}

export function getConnection(platform: PlatformId): Connection | null {
  const row = db().prepare("SELECT * FROM connections WHERE platform = ?").get(platform) as Row | undefined;
  if (!row) return null;
  return {
    account: row.account,
    maxLength: row.max_length ?? undefined,
    creds: JSON.parse(decrypt(row.secret)),
  };
}

/** Non-secret summary of stored connections; never decrypts. */
export function listConnections(): Map<string, { account: string; maxLength?: number }> {
  const rows = db().prepare("SELECT platform, account, max_length FROM connections").all() as Omit<Row, "secret">[];
  return new Map(rows.map((r) => [r.platform, { account: r.account, maxLength: r.max_length ?? undefined }]));
}

export function deleteConnection(platform: PlatformId) {
  db().prepare("DELETE FROM connections WHERE platform = ?").run(platform);
}
