# Broken Express 5 API

This small API worked with Express 4. Its dependency was upgraded to Express 5,
but three route patterns were not migrated.

Run the deterministic verification command:

```bash
npm ci
npm test
```

The repository is intentionally broken. A valid repair must:

- preserve all six expected HTTP behaviours;
- modify application code rather than tests;
- leave `package.json` and `package-lock.json` unchanged; and
- make the existing `npm test` command exit with code 0.

