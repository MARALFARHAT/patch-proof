import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyExpress5Failure,
  parseExpressMajor,
  validateGitNumstat,
  validatePatch,
} from "../lib/repair-policy.mjs";

const validPatch = `diff --git a/src/app.js b/src/app.js
index 58fbd38..e65a9cb 100644
--- a/src/app.js
+++ b/src/app.js
@@ -8 +8,2 @@
-app.get('/:file.:ext?', handler);
+app.get('/:file', handler);
+app.get('/:file{.:ext}', handler);
`;

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

test("uses Qwen's supported JSON mode with deterministic server validation", async () => {
  const route = await readFile(new URL("../app/api/repair/route.ts", import.meta.url), "utf8");
  assert.match(route, /response_format:\s*\{ type: "json_object" \}/);
  assert.doesNotMatch(route, /type: "json_schema"/);
  assert.match(route, /qwenModel: process\.env\.QWEN_MODEL \?\? "qwen-plus"/);
  assert.match(route, /Qwen returned unexpected repair-plan fields/);
});

test("hardens the live workflow around git, concurrency, and the full fixture", async () => {
  const route = await readFile(new URL("../app/api/repair/route.ts", import.meta.url), "utf8");
  assert.match(route, /git apply --numstat/);
  assert.match(route, /--include='src\/app\.js' --exclude='\*'/);
  assert.match(route, /validateGitNumstat/);
  assert.match(route, /REPAIR_BUSY/);
  assert.match(route, /regexp-like string routes/);
  assert.match(route, /give wildcards a name/);
  assert.match(route, /researchMigration\(config\.brightDataToken, baseline\.output\)/);
  assert.doesNotMatch(route, /false, 1\);/);
});
