import express from "express";
import { accounts, users } from "./data.js";
import { controlsRouter, applyRequestControls } from "./controls.js";
import { handleGraphQL } from "./graphql.js";
import { restRouter } from "./rest.js";
import { sessionRouter } from "./session.js";

const app = express();
const allowedOrigins = new Set([
  ...[8080, 8081, 8082, 5001, 5002].map((port) => `http://localhost:${port}`),
]);

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "x-poc-session, x-poc-account, content-type");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

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
