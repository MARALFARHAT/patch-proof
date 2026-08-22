import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { app } from "../src/app.js";

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("health endpoint still starts and responds", async () => {
  const result = await getJson("/health");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { status: "ok" });
});

test("file route accepts a filename without an extension", async () => {
  const result = await getJson("/readme");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    kind: "file",
    file: "readme",
    extension: null,
  });
});

test("file route captures an optional extension", async () => {
  const result = await getJson("/readme.md");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    kind: "file",
    file: "readme",
    extension: "md",
  });
});

test("discussion route preserves its section and slug", async () => {
  const result = await getJson("/discussion/agent-design");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    kind: "content",
    section: "discussion",
    slug: "agent-design",
  });
});

test("page route preserves its section and slug", async () => {
  const result = await getJson("/page/migration-guide");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    kind: "content",
    section: "page",
    slug: "migration-guide",
  });
});

test("unknown nested routes reach the fallback", async () => {
  const result = await getJson("/unknown/nested/path");
  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    kind: "fallback",
    path: "/unknown/nested/path",
  });
});

