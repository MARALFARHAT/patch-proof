import express from "express";

export const app = express();

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

// Express 4 accepted `?` for an optional path segment. Express 5 does not.
app.get("/:file.:ext?", (request, response) => {
  response.json({
    kind: "file",
    file: request.params.file,
    extension: request.params.ext ?? null,
  });
});

// Express 4 accepted regexp-like characters inside a string route.
app.get("/[discussion|page]/:slug", (request, response) => {
  response.json({
    kind: "content",
    section: request.path.split("/")[1],
    slug: request.params.slug,
  });
});

// Express 5 requires a wildcard to have a name.
app.get("/*", (request, response) => {
  response.status(404).json({
    kind: "fallback",
    path: request.path,
  });
});
