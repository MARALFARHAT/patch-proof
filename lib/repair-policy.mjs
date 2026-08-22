const ALLOWED_FILE = "src/app.js";
const MAX_CHANGED_LINES = 40;
const MAX_PATCH_BYTES = 10_000;

const ROUTE_MIGRATIONS = [
  {
    legacy: 'app.get("/:file.:ext?",',
    migrated: 'app.get("/:file{.:ext}",',
    label: "optional file extension route",
  },
  {
    legacy: 'app.get("/[discussion|page]/:slug",',
    migrated: 'app.get(["/discussion/:slug", "/page/:slug"],',
    label: "regexp-like discussion/page route",
  },
  {
    legacy: 'app.get("/*",',
    migrated: 'app.get("/*splat",',
    label: "unnamed wildcard route",
  },
];

function occurrences(value, search) {
  return value.split(search).length - 1;
}

export function applyRepairReplacements(replacements, sourceCode) {
  if (!Array.isArray(replacements) || typeof sourceCode !== "string") {
    throw new Error("Repair replacements are invalid");
  }

  const expected = ROUTE_MIGRATIONS.filter(({ legacy }) => sourceCode.includes(legacy)).map(
    ({ legacy, migrated, label }) => {
      const before = sourceCode.split("\n").find((line) => line.includes(legacy));
      if (!before || occurrences(sourceCode, before) !== 1) {
        throw new Error(`Could not isolate ${label}`);
      }
      return { before, after: before.replace(legacy, migrated), legacy, label };
    },
  );

  if (!expected.length) {
    throw new Error("No supported legacy routes were found");
  }
  if (replacements.length !== expected.length) {
    throw new Error(`Repair plan must contain exactly ${expected.length} route replacements`);
  }

  const normalized = replacements.map((replacement) => {
    if (
      !replacement ||
      typeof replacement !== "object" ||
      Object.keys(replacement).sort().join(",") !== "after,before" ||
      typeof replacement.before !== "string" ||
      typeof replacement.after !== "string" ||
      !replacement.before ||
      !replacement.after ||
      replacement.before.includes("\n") ||
      replacement.after.includes("\n")
    ) {
      throw new Error("Every repair replacement must contain one exact before line and after line");
    }
    return replacement;
  });

  let updatedSource = sourceCode;
  for (const requirement of expected) {
    const candidates = normalized.filter(({ before }) => before === requirement.before);
    if (candidates.length !== 1 || candidates[0].after !== requirement.after) {
      throw new Error(`Repair plan did not provide the canonical ${requirement.label} edit`);
    }
    if (occurrences(updatedSource, requirement.before) !== 1) {
      throw new Error(`Repair plan cannot safely locate ${requirement.label}`);
    }
    updatedSource = updatedSource.replace(requirement.before, requirement.after);
  }

  for (const requirement of expected) {
    if (updatedSource.includes(requirement.legacy) || !updatedSource.includes(requirement.after)) {
      throw new Error(`Repair plan did not complete ${requirement.label}`);
    }
  }

  return {
    valid: true,
    sourceCode: updatedSource,
    checkedRoutes: expected.map(({ legacy }) => legacy),
  };
}

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
    files.push(before, after);
  }

  // A valid git patch can contain another plain unified-diff file section
  // without a second `diff --git` header. Inspect every file marker rather
  // than trusting only the first header.
  for (const match of patch.matchAll(/^(---|\+\+\+) (?:[ab]\/(.+)|\/dev\/null)$/gm)) {
    const path = match[2];
    if (!path) throw new Error("File creation and deletion are not allowed");
    files.push(path);
  }

  const uniqueFiles = [...new Set(files)];
  if (uniqueFiles.some((file) => file !== ALLOWED_FILE)) {
    throw new Error(`Patch may only modify ${ALLOWED_FILE}`);
  }
  if (uniqueFiles.length !== 1 || uniqueFiles[0] !== ALLOWED_FILE) {
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

export function validateRepairCoverage(patch, sourceCode) {
  if (typeof patch !== "string" || typeof sourceCode !== "string") {
    throw new Error("Repair coverage inputs are invalid");
  }

  const removed = patch
    .split("\n")
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .join("\n");
  const added = patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
  const requirements = [
    {
      legacy: "/:file.:ext?",
      replacements: ["/:file{.:ext}"],
      label: "optional file extension route",
    },
    {
      legacy: "/[discussion|page]/:slug",
      replacements: ["/discussion/:slug", "/page/:slug"],
      label: "regexp-like discussion/page route",
    },
    {
      legacy: "/*",
      replacements: ["/*splat"],
      label: "unnamed wildcard route",
    },
  ];
  const checked = requirements.filter((requirement) => sourceCode.includes(requirement.legacy));
  const missing = [];

  for (const requirement of checked) {
    if (!removed.includes(requirement.legacy)) {
      missing.push(`remove ${requirement.label}`);
    }
    for (const replacement of requirement.replacements) {
      if (!added.includes(replacement)) {
        missing.push(`add ${replacement}`);
      }
    }
  }

  if (missing.length) {
    throw new Error(`Patch misses required route migrations: ${missing.join("; ")}`);
  }

  return { valid: true, checkedRoutes: checked.map((requirement) => requirement.legacy) };
}

export function validateGitNumstat(output) {
  if (typeof output !== "string") {
    throw new Error("git diff --numstat returned invalid output");
  }

  const rows = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));

  if (
    rows.length !== 1 ||
    rows[0].length < 3 ||
    rows[0].slice(2).join("\t") !== ALLOWED_FILE
  ) {
    throw new Error(`Git reports changes outside ${ALLOWED_FILE}`);
  }

  return { valid: true, files: [ALLOWED_FILE] };
}
