import { describe, expect, it, vi } from "vitest";
import { SESSION_CONTRACT_VERSION, type SessionApi, type SessionSnapshot } from "@poc/platform-contracts";
import { createShellCore, createShellRuntime } from "./createShellRuntime";

function fakeSession(initial: SessionSnapshot = { status: "anonymous", contextRevision: 0 }) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const getSnapshot = vi.fn(() => snapshot);
  const api: SessionApi = {
    contractVersion: SESSION_CONTRACT_VERSION,
    getSnapshot,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    requestLogin: vi.fn(),
    requestLogout: vi.fn(),
    requestAccountChange: vi.fn(),
  };
  return {
    api,
    listeners,
    set(next: SessionSnapshot) {
      snapshot = next;
      for (const l of [...listeners]) l();
    },
  };
}

const routes = { "/orders": "react", "/summary": "vue" };
const resolveUser = (subjectId: string) => ({ subjectId, displayName: `Name ${subjectId}` });
const make = (session = fakeSession()) => ({
  session,
  core: createShellCore({ session: session.api, routes, resolveUser }),
});
const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

describe("shell core", () => {
  it("starts at /orders, en, anonymous user", () => {
    expect(make().core.getState()).toEqual({ path: "/orders", language: "en", user: null });
  });

  it("navigate validates against route prefixes", () => {
    const { core } = make();
    core.navigate("/summary");
    expect(core.getState().path).toBe("/summary");
    core.navigate("/orders/ord_1");
    expect(core.getState().path).toBe("/orders/ord_1");
    expect(code(() => core.navigate("/nope"))).toBe("INVALID_PATH");
    expect(code(() => core.navigate("bad path"))).toBe("INVALID_PATH");
    expect(core.getState().path).toBe("/orders/ord_1");
  });

  it("setLanguage validates", () => {
    const { core } = make();
    core.setLanguage("th");
    expect(core.getState().language).toBe("th");
    expect(code(() => core.setLanguage("fr" as never))).toBe("INVALID_LANGUAGE");
  });

  it("keeps state identity until a field changes; no-op changes do not notify", () => {
    const { core } = make();
    const first = core.getState();
    expect(core.getState()).toBe(first);
    const onChange = vi.fn();
    core.subscribe(onChange);
    core.navigate("/orders");
    core.setLanguage("en");
    expect(core.getState()).toBe(first);
    expect(onChange).not.toHaveBeenCalled();
    core.navigate("/summary");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(core.getState()).not.toBe(first);
    expect(Object.isFrozen(core.getState())).toBe(true);
  });

  it("user follows the session", () => {
    const { core, session } = make();
    const onChange = vi.fn();
    core.subscribe(onChange);
    session.set({ status: "authenticated", subjectId: "user_ava", accountId: "a1", contextRevision: 1 });
    expect(core.getState().user).toEqual(resolveUser("user_ava"));
    expect(onChange).toHaveBeenCalledTimes(1);
    session.set({ status: "transitioning", contextRevision: 2 });
    expect(core.getState().user).toBeNull();
    session.set({ status: "authenticated", subjectId: "user_ava", accountId: "a2", contextRevision: 3 });
    session.set({ status: "anonymous", contextRevision: 4 });
    expect(core.getState().user).toBeNull();
  });

  it("session change that keeps the same user does not change state identity", () => {
    const { core, session } = make();
    session.set({ status: "authenticated", subjectId: "user_ava", accountId: "a1", contextRevision: 1 });
    const s = core.getState();
    session.set({ status: "authenticated", subjectId: "user_ava", accountId: "a2", contextRevision: 2 });
    expect(core.getState()).toBe(s);
  });

  it("getView resolves the active remote from the path", () => {
    const { core } = make();
    core.navigate("/orders/ord_1");
    expect(core.getView()).toEqual({ activeRemoteId: "react", layout: null });
    core.navigate("/summary");
    expect(core.getView().activeRemoteId).toBe("vue");
  });

  it("navigate and setLanguage never touch the session", () => {
    const { core, session } = make();
    const before = session.api.getSnapshot();
    const calls = (session.api.getSnapshot as ReturnType<typeof vi.fn>).mock.calls.length;
    core.navigate("/summary");
    core.setLanguage("th");
    expect((session.api.getSnapshot as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    expect(session.api.getSnapshot()).toBe(before);
    expect(before.contextRevision).toBe(0);
    expect(session.api.requestLogin).not.toHaveBeenCalled();
    expect(session.api.requestLogout).not.toHaveBeenCalled();
    expect(session.api.requestAccountChange).not.toHaveBeenCalled();
  });

  it("subscribe unsubscribes; dispose removes the session listener", () => {
    const { core, session } = make();
    const onChange = vi.fn();
    const off = core.subscribe(onChange);
    core.navigate("/summary");
    off();
    core.navigate("/orders");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(session.listeners.size).toBe(1);
    core.dispose();
    expect(session.listeners.size).toBe(0);
  });
});

describe("createShellRuntime stubs", () => {
  it("exposes state and throws not implemented for later-task methods", () => {
    const session = fakeSession();
    const runtime = createShellRuntime({ session: session.api, routes, resolveUser });
    expect(runtime.getView()).toEqual({ activeRemoteId: "react", layout: null });
    expect(() => runtime.forRemote("react")).toThrow("not implemented");
    expect(() => runtime.shellNavigate("/summary")).toThrow("not implemented");
    runtime.dispose();
    expect(session.listeners.size).toBe(0);
  });
});
