import { randomBytes, webcrypto } from "node:crypto";

const PROJECT_URL = "https://eidvougocycgramikbwq.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_1Jgx31Yywb2hkexOcBJyVg_GWnIIPRU";
const AUTH_ENDPOINT = `${PROJECT_URL}/functions/v1/auth-gateway`;
const DATA_ENDPOINT = `${PROJECT_URL}/functions/v1/diary-data`;
const WORKSPACE_ID = "pds-main";

globalThis.crypto ??= webcrypto;
globalThis.btoa ??= (value) => Buffer.from(value, "binary").toString("base64");

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function decodeJwtSubject(token) {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return payload.sub;
}

async function encryptCredentials(publicKeyJwk, email, password) {
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clearBytes = new TextEncoder().encode(JSON.stringify({ email, password }));
  try {
    const [ciphertext, rawAesKey] = await Promise.all([
      crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, clearBytes),
      crypto.subtle.exportKey("raw", aesKey),
    ]);
    const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawAesKey);
    new Uint8Array(rawAesKey).fill(0);
    return {
      encrypted_key: bytesToBase64(new Uint8Array(encryptedKey)),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  } finally {
    clearBytes.fill(0);
  }
}

async function createAccount(label, publicKey) {
  const suffix = `${Date.now()}-${randomBytes(5).toString("hex")}`;
  const email = `t07-${label}-${suffix}@example.com`;
  let password = `${randomBytes(24).toString("base64url")}!Aa7`;
  try {
    const encrypted = await encryptCredentials(publicKey, email, password);
    const response = await fetch(AUTH_ENDPOINT, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "signup", ...encrypted }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.access_token) {
      throw new Error(`시험 계정 ${label} 생성 실패: HTTP ${response.status}; 세션 발급 여부 ${Boolean(payload.access_token)}`);
    }
    return { label, email, token: payload.access_token, userId: decodeJwtSubject(payload.access_token) };
  } finally {
    password = "";
  }
}

function authHeaders(account, extra = {}) {
  return {
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${account.token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(account, path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${DATA_ENDPOINT}/${path}`, {
    method,
    headers: authHeaders(account, headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let responseBody = text;
  try {
    responseBody = text ? JSON.parse(text) : null;
  } catch {
    // Keep a non-JSON error body verbatim as evidence.
  }
  return { status: response.status, body: responseBody };
}

async function insertTasks(account) {
  const marker = `${account.label}-${Date.now()}`;
  const dueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const result = await request(account, "tasks?select=id,title,user_id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: [1, 2].map((number) => ({
      workspace_id: WORKSPACE_ID,
      plan_version: 1,
      title: `T07 ${marker} 자료 ${number}`,
      due_date: dueDate,
      priority: number === 1 ? "high" : "medium",
      tags: ["t07-owner-isolation"],
      estimated_minutes: 15 + number,
    })),
  });
  if (result.status !== 201 || !Array.isArray(result.body) || result.body.length !== 2) {
    throw new Error(`시험 자료 생성 실패(${account.label}): ${JSON.stringify(result)}`);
  }
  return result.body;
}

async function listOwn(account) {
  return request(account, `tasks?workspace_id=eq.${WORKSPACE_ID}&select=id,title,user_id&order=id.asc`);
}

async function countOwn(account) {
  const result = await listOwn(account);
  if (result.status !== 200 || !Array.isArray(result.body)) throw new Error(`목록 조회 실패: ${JSON.stringify(result)}`);
  return result.body.length;
}

async function crossRequests(actor, targetRow) {
  return {
    read: await request(actor, `tasks?id=eq.${targetRow.id}&select=id,title,user_id`),
    update: await request(actor, `tasks?id=eq.${targetRow.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { title: `T07 unauthorized update by ${actor.label}` },
    }),
    delete: await request(actor, `tasks?id=eq.${targetRow.id}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    }),
  };
}

async function unauthenticatedRequest(path) {
  const response = await fetch(`${DATA_ENDPOINT}/${path}`, {
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep a non-JSON error body verbatim as evidence.
  }
  return { status: response.status, body };
}

async function main() {
  const keyResponse = await fetch(AUTH_ENDPOINT, { headers: { apikey: PUBLISHABLE_KEY } });
  const keyPayload = await keyResponse.json();
  if (!keyResponse.ok || !keyPayload.public_key) throw new Error(`인증 공개키 조회 실패: HTTP ${keyResponse.status}`);

  const accountA = await createAccount("a", keyPayload.public_key);
  const accountB = await createAccount("b", keyPayload.public_key);
  const rowsA = await insertTasks(accountA);
  const rowsB = await insertTasks(accountB);

  const countsBefore = { a: await countOwn(accountA), b: await countOwn(accountB) };
  const aToB = await crossRequests(accountA, rowsB[0]);
  const bToA = await crossRequests(accountB, rowsA[0]);
  const countsAfter = { a: await countOwn(accountA), b: await countOwn(accountB) };

  const spoofedAddress = await request(
    accountA,
    `tasks?user_id=eq.${encodeURIComponent(accountB.userId)}&select=id,title,user_id`,
  );
  const spoofedHeader = await request(accountA, `tasks?workspace_id=eq.${WORKSPACE_ID}&select=id,title,user_id`, {
    headers: { "X-User-Id": accountB.userId },
  });
  const spoofedBody = await request(accountA, "tasks?select=id,title,user_id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      user_id: accountB.userId,
      workspace_id: WORKSPACE_ID,
      plan_version: 1,
      title: "T07 spoofed owner body",
      due_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      priority: "low",
      tags: ["t07-owner-isolation"],
      estimated_minutes: 10,
    },
  });

  const finalA = await listOwn(accountA);
  const finalB = await listOwn(accountB);
  const output = {
    tested_at: new Date().toISOString(),
    accounts: [
      { label: accountA.label, email: accountA.email, user_id: accountA.userId, inserted_rows: rowsA },
      { label: accountB.label, email: accountB.email, user_id: accountB.userId, inserted_rows: rowsB },
    ],
    counts_before: countsBefore,
    a_to_b: aToB,
    b_to_a: bToA,
    counts_after: countsAfter,
    spoofing: { address: spoofedAddress, header: spoofedHeader, body: spoofedBody },
    unauthenticated: await unauthenticatedRequest(`tasks?id=eq.${rowsA[0].id}&select=id,title,user_id`),
    final_lists: { a: finalA, b: finalB },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
