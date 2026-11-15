import { Router } from "express";
import { accounts, users } from "./data.js";

export const sessionRouter = Router();

sessionRouter.post("/login", (req, res) => {
  const subjectId = req.body?.subjectId;
  const user = typeof subjectId === "string" ? users[subjectId] : undefined;
  if (!user) {
    res.status(401).json({ error: "Unknown fictional user" });
    return;
  }
  const account = Object.values(accounts).find((item) => item.ownerSubjectId === subjectId)!;
  res.json({ user, account, session: { subjectId: user.subjectId } });
});

sessionRouter.post("/logout", (_req, res) => {
  res.json({ ok: true, session: null });
});

sessionRouter.post("/account", (req, res) => {
  const subjectId = req.body?.subjectId;
  const accountId = req.body?.accountId;
  const account = typeof accountId === "string" ? accounts[accountId] : undefined;
  if (typeof subjectId !== "string" || !users[subjectId] || !account || account.ownerSubjectId !== subjectId) {
    res.status(403).json({ error: "Account is not available to this fictional user" });
    return;
  }
  res.json({ account });
});
