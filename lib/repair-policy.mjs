const ALLOWED_FILE = "src/app.js";
const MAX_CHANGED_LINES = 40;
const MAX_PATCH_BYTES = 10_000;

export function parseExpressMajor(packageJsonText) {
  let manifest;
  try {
    manifest = JSON.parse(packageJsonText);
  } catch {
    return null;
  }

  const version =
    manifest.dependencies?.express ?? manifest.devDependencies?.express ?? null;
  if (typeof version !== "string") return null;
  const match = version.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function classifyExpress5Failure({ baselineOutput, packageJsonText, sourceCode }) {
  const isExpress5 = parseExpressMajor(packageJsonText) === 5;
  const routeParserFailure =
    /Unexpected \?|Missing parameter name|path-to-regexp/i.test(baselineOutput);
  const hasLegacyOptionalRoute = /['"`]\/[^'"`]*:[A-Za-z_$][\w$]*\?[^'"`]*['"`]/.test(
    sourceCode,
  );

  if (isExpress5 && routeParserFailure && hasLegacyOptionalRoute) {
    return {
      supported: true,
      category: "express5-route-syntax",
      reason: "Express 5 is rejecting an Express 4-style optional route parameter.",
    };
  }

  return {
    supported: false,
    category: "unsupported",
    reason:
      "This MVP only repairs Express 4 to Express 5 optional route-syntax failures.",
  };
}

export function validatePatch(patch) {
  if (typeof patch !== "string" || !patch.trim()) {
    throw new Error("Patch must be a non-empty unified diff");
  }

  const bytes = new TextEncoder().encode(patch).byteLength;
  if (bytes > MAX_PATCH_BYTES) {
    throw new Error(`Patch exceeds ${MAX_PATCH_BYTES} bytes`);
  }

  const files = [];
  for (const match of patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)) {
    const [, before, after] = match;
    if (before !== after) throw new Error("Renames are not allowed");
    if (after !== ALLOWED_FILE) {
      throw new Error(`Patch may only modify ${ALLOWED_FILE}`);
    }
    files.push(after);
  }

  const uniqueFiles = [...new Set(files)];
  if (uniqueFiles.length !== 1) {
    throw new Error(`Patch must modify exactly ${ALLOWED_FILE}`);
  }

  const changedLines = patch.split("\n").filter(
    (line) =>
      (line.startsWith("+") && !line.startsWith("+++")) ||
      (line.startsWith("-") && !line.startsWith("---")),
  ).length;

  if (changedLines > MAX_CHANGED_LINES) {
    throw new Error(`Patch changes more than ${MAX_CHANGED_LINES} lines`);
  }

  return { valid: true, files: uniqueFiles, changedLines, bytes };
}

