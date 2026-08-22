import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyExpress5Failure,
  parseExpressMajor,
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

