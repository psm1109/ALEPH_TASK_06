import { webcrypto } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "supabase", ".env.auth.local");
const pair = await webcrypto.subtle.generateKey(
  {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["encrypt", "decrypt"],
);
const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
const encoded = Buffer.from(JSON.stringify(privateJwk)).toString("base64");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `AUTH_PRIVATE_JWK_B64=${encoded}\n`, { mode: 0o600 });
process.stdout.write("Created ignored Supabase auth secret file: supabase/.env.auth.local\n");
