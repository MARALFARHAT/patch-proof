import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyRepairReplacements,
  classifyExpress5Failure,
  parseExpressMajor,
  validateGitNumstat,
  validatePatch,
  validateRepairCoverage,
} from "../lib/repair-policy.mjs";

const brokenSource = `import express from "express";

app.get("/:file.:ext?", (request, response) => {
});
app.get("/[discussion|page]/:slug", (request, response) => {
});
app.get("/*", (request, response) => {
});
`;

const validPatch = `diff --git a/src/app.js b/src/app.js
index 58fbd38..e65a9cb 100644
--- a/src/app.js
+++ b/src/app.js
@@ -8 +8,2 @@
-app.get('/:file.:ext?', handler);
+app.get('/:file', handler);
+app.get('/:file{.:ext}', handler);
`;

const validPlainUnifiedDiff = validPatch.replace(
  "diff --git a/src/app.js b/src/app.js\nindex 58fbd38..e65a9cb 100644\n",
  "",
);

test("classifies only the supported Express 5 route-syntax failure", () => {
  const supported = classifyExpress5Failure({
    baselineOutput: "TypeError: Unexpected ? at index 11: /:file.:ext?",
    packageJsonText: JSON.stringify({ dependencies: { express: "^5.2.1" } }),
    sourceCode: "app.get('/:file.:ext?', handler);",
  });
  assert.equal(supported.supported, true);
  assert.equal(supported.category, "express5-route-syntax");

  const unsupported = classifyExpress5Failure({
    baselineOutput: "ReferenceError: database is not defined",
    packageJsonText: JSON.stringify({ dependencies: { express: "^5.2.1" } }),
    sourceCode: "app.get('/:file.:ext?', handler);",
  });
  assert.equal(unsupported.supported, false);
});

test("reads the Express major version deterministically", () => {
  assert.equal(parseExpressMajor('{"dependencies":{"express":"~5.2.0"}}'), 5);
  assert.equal(parseExpressMajor("not json"), null);
});

test("accepts a minimal allowlisted patch", () => {
  assert.deepEqual(validatePatch(validPatch), {
    valid: true,
    files: ["src/app.js"],
    changedLines: 3,
    bytes: new TextEncoder().encode(validPatch).byteLength,
  });
});

test("accepts a standard plain unified diff for the same allowlisted file", () => {
  assert.deepEqual(validatePatch(validPlainUnifiedDiff), {
    valid: true,
    files: ["src/app.js"],
    changedLines: 3,
    bytes: new TextEncoder().encode(validPlainUnifiedDiff).byteLength,
  });
});

test("requires a repair patch to cover every legacy route present in the source", () => {
  const sourceCode = `
app.get("/:file.:ext?", handler);
app.get("/[discussion|page]/:slug", handler);
app.get("/*", handler);
`;
  const completePatch = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -1,3 +1,3 @@
-app.get("/:file.:ext?", handler);
-app.get("/[discussion|page]/:slug", handler);
-app.get("/*", handler);
+app.get("/:file{.:ext}", handler);
+app.get(["/discussion/:slug", "/page/:slug"], handler);
+app.get("/*splat", handler);
`;
  assert.deepEqual(validateRepairCoverage(completePatch, sourceCode), {
    valid: true,
    checkedRoutes: ["/:file.:ext?", "/[discussion|page]/:slug", "/*"],
  });
  assert.throws(
    () => validateRepairCoverage(validPatch, sourceCode),
    /Patch misses required route migrations/,
  );
});

test("applies only complete canonical line replacements for every fixture route", () => {
  const replacements = [
    {
      before: 'app.get("/:file.:ext?", (request, response) => {',
      after: 'app.get("/:file{.:ext}", (request, response) => {',
    },
    {
      before: 'app.get("/[discussion|page]/:slug", (request, response) => {',
      after:
        'app.get(["/discussion/:slug", "/page/:slug"], (request, response) => {',
    },
    {
      before: 'app.get("/*", (request, response) => {',
      after: 'app.get("/*splat", (request, response) => {',
    },
  ];
  const result = applyRepairReplacements(replacements, brokenSource);
  assert.deepEqual(result.checkedRoutes, [
    'app.get("/:file.:ext?",',
    'app.get("/[discussion|page]/:slug",',
    'app.get("/*",',
  ]);
  assert.match(result.sourceCode, /\/:file\{\.:ext\}/);
  assert.match(result.sourceCode, /\["\/discussion\/:slug", "\/page\/:slug"\]/);
  assert.match(result.sourceCode, /\/\*splat/);
  assert.doesNotMatch(result.sourceCode, /\/:file\.:ext\?/);
});

test("rejects partial or non-canonical structured edits", () => {
  assert.throws(
    () =>
      applyRepairReplacements(
        [
          {
            before: 'app.get("/:file.:ext?", (request, response) => {',
            after: 'app.get("/:file{.:ext}", (request, response) => {',
          },
        ],
        brokenSource,
      ),
    /exactly 3 route replacements/,
  );
});

test("rejects patches that touch tests or configuration", () => {
  const unsafe = validPatch.replaceAll("src/app.js", "test/app.test.js");
  assert.throws(() => validatePatch(unsafe), /only modify src\/app\.js/);
});

test("rejects a hidden second unified-diff section that rewrites tests", () => {
  const bypassAttempt = `${validPatch}
--- a/test/routes.test.js
+++ b/test/routes.test.js
@@ -1 +1 @@
-SAFE
+PWNED
`;
  assert.throws(() => validatePatch(bypassAttempt), /only modify src\/app\.js/);
});

test("trusts git numstat only when git reports the allowlisted file", () => {
  assert.deepEqual(validateGitNumstat("2\t1\tsrc/app.js\n"), {
    valid: true,
    files: ["src/app.js"],
  });
  assert.throws(
    () => validateGitNumstat("2\t1\tsrc/app.js\n1\t1\ttest/routes.test.js\n"),
    /outside src\/app\.js/,
  );
});

test("uses Anthropic's native structured output with deterministic server validation", async () => {
  const route = await readFile(new URL("../app/api/repair/route.ts", import.meta.url), "utf8");
  assert.match(route, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(route, /"x-api-key": apiKey/);
  assert.match(route, /"anthropic-version": ANTHROPIC_VERSION/);
  assert.match(route, /type: "json_schema"/);
  assert.match(route, /additionalProperties: false/);
  assert.match(route, /anthropicModel: process\.env\.ANTHROPIC_MODEL \?\? "claude-sonnet-5"/);
  assert.match(route, /Anthropic returned unexpected repair-plan fields/);
  assert.match(route, /applyRepairReplacements\(candidatePlan\.replacements, sourceCode\)/);
  assert.doesNotMatch(route, /plan\.patch/);
  assert.doesNotMatch(route, /QWEN_|DASHSCOPE|Qwen/);
});

test("hardens the live workflow around git, concurrency, and the full fixture", async () => {
  const route = await readFile(new URL("../app/api/repair/route.ts", import.meta.url), "utf8");
  assert.match(route, /git diff --numstat -- src\/app\.js/);
  assert.match(route, /writeFileSync\('src\/app\.js'/);
  assert.match(route, /validateGitNumstat/);
  assert.match(route, /validateRepairCoverage/);
  assert.match(route, /validateRepairCoverage\(diff, sourceCode\)/);
  assert.match(route, /Repair plan rejected before execution/);
  assert.match(route, /REPAIR_BUSY/);
  assert.match(route, /regexp-like string routes/);
  assert.match(route, /give wildcards a name/);
  assert.match(route, /researchMigration\(config\.brightDataToken, baseline\.output\)/);
  assert.doesNotMatch(route, /searchParams\.set\("tools"/);
  assert.match(route, /if \(!content\.trim\(\)\) content = searchText/);
  assert.match(route, /const DEMO_BRANCH = "express5-broken-demo"/);
  assert.match(route, /REPO_PATH,\s*DEMO_BRANCH,\s*commitSha/);
  assert.doesNotMatch(route, /false, 1\);/);
});
