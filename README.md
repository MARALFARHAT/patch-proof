# PatchProof

PatchProof is a constrained autonomous migration agent for one reliable repair category: Express 4 optional-route syntax that breaks after an Express 5 upgrade.

It does not suggest a hypothetical fix. It retrieves current migration evidence with Bright Data, creates an isolated Daytona sandbox, asks Qwen for a constrained minimal patch, and proves the result with the same `npm test` command that failed before.

## Sponsor workflow

1. **Daytona** creates an ephemeral sandbox, clones the exact allowlisted commit, installs dependencies, and runs `npm test` to capture the real failure.
2. **Bright Data** uses its hosted MCP `search_engine` and `scrape_as_markdown` tools to retrieve current Express migration documentation. PatchProof does not need a bulk dataset for this use case.
3. **Qwen Cloud** receives only the failure output, `package.json`, `src/app.js`, and retrieved evidence. It returns JSON containing a root cause, cited evidence IDs, a minimal diff, and unresolved risks.
4. PatchProof validates the JSON and diff, allows changes only to `src/app.js`, applies the patch inside Daytona, and runs the same test command again.
5. Success is displayed only when the real final process exit code is `0`.

Nosana is intentionally not part of the MVP runtime. This repair profile has no useful GPU workload: Qwen already supplies model inference and Daytona supplies isolated execution. A decorative Nosana call would make the demo less reliable without improving the repair.

## Runtime contract

- Public repositories only, restricted by `PATCHPROOF_REPO_ALLOWLIST`
- Fixed install command: `npm ci --ignore-scripts --no-audit --no-fund`
- Fixed verification command: `npm test`
- Supported failure classifier: Express 5 + `path-to-regexp` optional-route syntax
- Generated changes may touch only `src/app.js`
- Maximum patch size: 10 KB / 40 changed lines
- Maximum repair attempts: 2
- Ephemeral Daytona sandbox with a five-minute TTL and restricted outbound domains
- A repair is successful only when final verification exits with code `0`

## Required environment

Configure these through the hosting environment; never commit them:

```text
DAYTONA_API_KEY
BRIGHTDATA_API_TOKEN
DASHSCOPE_API_KEY
QWEN_BASE_URL
PATCHPROOF_REPO_ALLOWLIST
PATCHPROOF_DEMO_COMMIT
```

Optional:

```text
QWEN_MODEL=qwen-plus
PATCHPROOF_PUBLIC_ORIGIN=https://patchproof.example.com
```

`QWEN_BASE_URL` is the workspace-specific Qwen OpenAI-compatible URL without `/chat/completions`. For Seoul, use a Singapore-region Model Studio workspace. `PATCHPROOF_REPO_ALLOWLIST` is a comma-separated list of exact public Git repository URLs. `PATCHPROOF_DEMO_COMMIT` pins the deterministic broken fixture. `PATCHPROOF_PUBLIC_ORIGIN` overrides the trusted production origin used to emit an absolute social-card URL.

## Commands

```bash
npm test
npm run lint
npm run dev
```

The API streams newline-delimited JSON. Every UI status is sourced from a real backend event. When runtime configuration is absent, `/api/repair` returns `503 CONFIGURATION_REQUIRED` instead of replaying a demo result.
