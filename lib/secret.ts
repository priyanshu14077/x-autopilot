import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// AES-256-GCM encryption for credentials stored on disk. The key comes from
// APP_SECRET (base64, 32 bytes) if set, otherwise from a 0600 key file in .data/.
// The key file sits next to the database, so this protects against the database
// file leaking on its own, not against full access to this machine.

export const DATA_DIR = path.join(process.cwd(), ".data");
const KEY_FILE = path.join(DATA_DIR, "secret.key");

const g = globalThis as unknown as { __xaKey?: Buffer };

function loadKey(): Buffer {
  const fromEnv = process.env.APP_SECRET?.trim();
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) throw new Error("APP_SECRET must be 32 bytes, base64-encoded.");
    return key;
  }
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  if (existsSync(KEY_FILE)) return Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "base64");
  const key = randomBytes(32);
  writeFileSync(KEY_FILE, key.toString("base64"), { mode: 0o600 });
  return key;
}

const key = () => (g.__xaKey ??= loadKey());

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, ct] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized secret format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
