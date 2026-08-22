# PatchProof

PatchProof is a constrained autonomous migration agent for one reliable repair category: Express 4 optional-route syntax that breaks after an Express 5 upgrade.

It does not suggest a hypothetical fix. It retrieves current migration evidence with Bright Data, creates an isolated Daytona sandbox, asks Qwen for a schema-constrained minimal patch, and proves the result with the same `npm test` command that failed before.

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
```

Optional:

```text
QWEN_MODEL=qwen3.7-plus
PATCHPROOF_PUBLIC_ORIGIN=https://patchproof.example.com
```

`QWEN_BASE_URL` is the workspace-specific Qwen OpenAI-compatible URL without `/chat/completions`. `PATCHPROOF_REPO_ALLOWLIST` is a comma-separated list of exact public Git repository URLs. `PATCHPROOF_PUBLIC_ORIGIN` overrides the trusted production origin used to emit an absolute social-card URL.

## Commands

```bash
npm test
npm run lint
npm run dev
```

The API streams newline-delimited JSON. Every UI status is sourced from a real backend event. When runtime configuration is absent, `/api/repair` returns `503 CONFIGURATION_REQUIRED` instead of replaying a demo result.
