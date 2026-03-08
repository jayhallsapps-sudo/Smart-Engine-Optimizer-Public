import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getRequiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[startup] Required environment variable ${key} is not set. Server cannot start without it.`);
  return val;
}

function getKey(): Buffer {
  const secret = getRequiredEnv("SESSION_SECRET");
  const salt = process.env.ENCRYPTION_SALT || "smarteo-salt-v1";
  return scryptSync(secret, salt, 32);
}

export function deriveInternalToken(): string {
  const secret = getRequiredEnv("SESSION_SECRET");
  return createHmac("sha256", secret).update("smarteo-internal-token-v1").digest("hex").slice(0, 40);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted value format");
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
