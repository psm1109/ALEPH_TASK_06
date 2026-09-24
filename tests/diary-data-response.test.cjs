const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const moduleUrl = pathToFileURL(path.join(__dirname, "../supabase/functions/diary-data/forward-response.mjs")).href;

test("diary-data 함수가 검증된 응답 전달 코드를 사용한다", () => {
  const edgeFunction = fs.readFileSync(path.join(__dirname, "../supabase/functions/diary-data/index.ts"), "utf8");
  assert.match(edgeFunction, /import \{ forwardResponse \} from "\.\/forward-response\.mjs"/);
  assert.match(edgeFunction, /return forwardResponse\(upstream, responseHeaders\(upstream\)\)/);
});

test("본문 없는 삭제 응답을 오류 없이 전달한다", async () => {
  const { forwardResponse } = await import(moduleUrl);
  const headers = new Headers({ "Access-Control-Allow-Origin": "*" });
  const response = await forwardResponse(new Response(null, { status: 204 }), headers);

  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("본문이 있는 응답은 내용을 유지한다", async () => {
  const { forwardResponse } = await import(moduleUrl);
  const headers = new Headers({ "Content-Type": "application/json" });
  const response = await forwardResponse(new Response('{"id":1}', { status: 200 }), headers);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/json");
  assert.deepEqual(await response.json(), { id: 1 });
});

test("다른 본문 없는 상태도 정상 전달한다", async () => {
  const { forwardResponse } = await import(moduleUrl);
  for (const status of [205, 304]) {
    const response = await forwardResponse(new Response(null, { status }), new Headers());
    assert.equal(response.status, status);
    assert.equal(response.body, null);
  }
});
