import { Router } from "express";
import { orders } from "./data.js";

export const restRouter = Router();

restRouter.get("/", (req, res) => {
  const accountId = req.get("x-poc-account");
  res.json(orders.filter((order) => order.accountId === accountId));
});

restRouter.post("/:id/note", (req, res) => {
  const accountId = req.get("x-poc-account");
  const order = orders.find((item) => item.id === req.params.id && item.accountId === accountId);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (typeof req.body?.note !== "string") {
    res.status(400).json({ error: "note must be a string" });
    return;
  }
  order.note = req.body.note;
  res.json(order);
});
