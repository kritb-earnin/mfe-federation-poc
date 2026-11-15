import express from "express";
import { accounts, users } from "./data.js";
import { controlsRouter, applyRequestControls } from "./controls.js";
import { handleGraphQL } from "./graphql.js";
import { restRouter } from "./rest.js";
import { sessionRouter } from "./session.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/__controls", controlsRouter());
app.use("/api/session", sessionRouter);

function enforceAccountScope(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const subjectId = req.get("x-poc-session");
  const accountId = req.get("x-poc-account");
  const account = accountId ? accounts[accountId] : undefined;
  if (!subjectId || !users[subjectId] || !account || account.ownerSubjectId !== subjectId) {
    res.status(403).json({ error: "A valid matching x-poc-session and x-poc-account scope is required" });
    return;
  }
  next();
}

app.use("/api/orders", enforceAccountScope, applyRequestControls, restRouter);
app.post("/graphql", enforceAccountScope, applyRequestControls, handleGraphQL);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const port = Number(process.env.PORT ?? 4010);
app.listen(port, "0.0.0.0", () => {
  console.log(`Fictional mock API listening on ${port}`);
});
