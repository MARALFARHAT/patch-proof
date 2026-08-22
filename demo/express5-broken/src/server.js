import { app } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.listen(port, () => {
  console.log(`PatchProof demo API listening on http://localhost:${port}`);
});

