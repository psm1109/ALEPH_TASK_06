import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { encryptAuthCredentials } from "../public/auth-crypto.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");

const testEmail = "security-test@example.com";
const testPassword = "TEST_ONLY_plaintext_42!";
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
const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
const encrypted = await encryptAuthCredentials(publicJwk, testEmail, testPassword);
const requestPayload = JSON.stringify({ mode: "login", ...encrypted });

assert.deepEqual(Object.keys(encrypted).sort(), ["ciphertext", "encrypted_key", "iv"]);
assert.ok(!requestPayload.includes(testEmail));
assert.ok(!requestPayload.includes(testPassword));
assert.ok(!requestPayload.includes('"password"'));

const fromBase64 = (value) => Uint8Array.from(Buffer.from(value, "base64"));
const rawAesKey = await webcrypto.subtle.decrypt(
  { name: "RSA-OAEP" },
  pair.privateKey,
  fromBase64(encrypted.encrypted_key),
);
const aesKey = await webcrypto.subtle.importKey("raw", rawAesKey, "AES-GCM", false, ["decrypt"]);
const clear = await webcrypto.subtle.decrypt(
  { name: "AES-GCM", iv: fromBase64(encrypted.iv) },
  aesKey,
  fromBase64(encrypted.ciphertext),
);

assert.deepEqual(JSON.parse(new TextDecoder().decode(clear)), {
  email: testEmail,
  password: testPassword,
});
console.log("auth payload encryption checks: 5 passed");
