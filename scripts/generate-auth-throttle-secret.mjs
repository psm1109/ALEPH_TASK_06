import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "supabase", ".env.auth-throttle.local");
const secret = randomBytes(32).toString("base64url");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `AUTH_THROTTLE_HMAC_SECRET=${secret}\n`, { mode: 0o600 });
process.stdout.write("Created ignored login throttle secret file: supabase/.env.auth-throttle.local\n");
