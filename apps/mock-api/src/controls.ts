import { Router, type Request, type Response, type NextFunction } from "express";
import { orders } from "./data.js";

interface ControlsState {
  delayMs: number;
  delayRoutes?: Set<string>;
  failNext: Map<string, number>;
  cleanupFail: boolean;
}

const state: ControlsState = {
  delayMs: 0,
  failNext: new Map(),
  cleanupFail: false,
};

export async function applyRequestControls(req: Request, res: Response, next: NextFunction): Promise<void> {
  const route = req.originalUrl.split("?")[0]!;
  const status = state.failNext.get(route);
  if (status !== undefined) {
    state.failNext.delete(route);
    res.status(status).json({ error: "Fictional mock failure" });
    return;
  }
  if (state.delayMs > 0 && (!state.delayRoutes || state.delayRoutes.has(route))) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, state.delayMs);
    });
  }
  next();
}

export function controlsRouter() {
  const router = Router();
  router.post("/delay", (req, res) => {
    const ms = req.body?.ms;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0 || ms > 60_000) {
      res.status(400).json({ error: "ms must be a number between 0 and 60000" });
      return;
    }
    const routes = req.body.routes;
    if (routes !== undefined && (!Array.isArray(routes) || routes.some((route: unknown) => typeof route !== "string"))) {
      res.status(400).json({ error: "routes must be an array of route paths" });
      return;
    }
    state.delayMs = ms;
    state.delayRoutes = routes === undefined ? undefined : new Set(routes);
    res.json({ ok: true });
  });

  router.post("/fail-next", (req, res) => {
    const route = req.body?.route;
    const status = req.body?.status ?? 500;
    if (typeof route !== "string" || !route.startsWith("/") || !Number.isInteger(status) || status < 400 || status > 599) {
      res.status(400).json({ error: "route and an optional HTTP error status are required" });
      return;
    }
    state.failNext.set(route, status);
    res.json({ ok: true });
  });

  router.post("/cleanup-fail", (req, res) => {
    if (typeof req.body?.enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    state.cleanupFail = req.body.enabled;
    res.json({ ok: true });
  });

  router.get("/state", (_req, res) => {
    res.json({ cleanupFail: state.cleanupFail, delayMs: state.delayMs, failNext: [...state.failNext.keys()] });
  });

  router.post("/reset", (_req, res) => {
    state.delayMs = 0;
    state.delayRoutes = undefined;
    state.failNext.clear();
    state.cleanupFail = false;
    for (const order of orders) {
      order.note = order.status === "closed" ? "Completed" : "";
    }
    res.json({ ok: true });
  });
  return router;
}
