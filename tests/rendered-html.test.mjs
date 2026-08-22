import assert from "node:assert/strict";
import test from "node:test";

test("renders the finished PatchProof shell", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>PatchProof<\/title>/);
  assert.doesNotMatch(html, /Starter Project/);
  assert.match(html, /Don.t guess the fix/);
  assert.match(html, /Every status below comes from backend execution/);
  const ogImage = html.match(/https?:\/\/[^"'<>]+\/og\.png/i)?.[0];
  assert.ok(ogImage, "expected an Open Graph image URL");
  assert.doesNotThrow(() => new URL(ogImage));
  assert.match(ogImage, /\/og\.png$/);
});

test("repair API fails closed when sponsor configuration is absent", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/api/repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repoUrl: "https://github.com/example/example" }),
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("content-type"), "application/json");
  const body = await response.json();
  assert.equal(body.error, "CONFIGURATION_REQUIRED");
});

test("repair API advertises its fixed public capability profile", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("config-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/repair"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    {
      configured: body.configured,
      integrations: body.integrations,
      profile: body.profile,
      verificationCommand: body.verificationCommand,
      maxAttempts: body.maxAttempts,
    },
    {
      configured: false,
      integrations: { brightData: false, qwen: false, daytona: false },
      profile: "express5-route-syntax",
      verificationCommand: "npm test",
      maxAttempts: 2,
    },
  );
});
