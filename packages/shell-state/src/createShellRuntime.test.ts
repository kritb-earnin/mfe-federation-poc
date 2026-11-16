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
    expect(() => runtime.registerRemote("react", {} as never)).toThrow("not implemented");
    expect(() => runtime.shellNavigate("/summary")).toThrow("not implemented");
    runtime.dispose();
    expect(session.listeners.size).toBe(0);
  });
});

type FakeEl = HTMLElement & { nodes: unknown[] };
const fakeEl = () => {
  const el = { nodes: [] as unknown[], replaceChildren: (...nodes: unknown[]) => (el.nodes = nodes) };
  return el as unknown as FakeEl;
};
/** render that writes a marker and returns a cleanup spy */
const renderer = () => {
  const cleanup = vi.fn();
  const render = vi.fn((el: HTMLElement) => {
    (el as FakeEl).nodes = ["content"];
    return cleanup;
  });
  return { render, cleanup };
};

describe("facade layout", () => {
  it("view shows only the active remote's layout; releases are independent", () => {
    const { core } = make();
    const react = core.forRemote("react");
    const vue = core.forRemote("vue");
    const releaseA = react.setLayout({ title: "A" });
    vue.setLayout({ title: "B" });
    expect(core.getView().layout?.title).toBe("A");
    core.navigate("/summary");
    expect(core.getView().layout?.title).toBe("B");
    releaseA();
    expect(core.getView().layout?.title).toBe("B");
    core.navigate("/orders");
    expect(core.getView().layout).toBeNull();
  });

  it("setLayout notifies and keeps view identity stable between changes", () => {
    const { core } = make();
    const onChange = vi.fn();
    core.subscribe(onChange);
    const release = core.forRemote("react").setLayout({ title: "A" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(core.getView()).toBe(core.getView());
    release();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(core.getView().layout).toBeNull();
  });

  it("invalid spec throws INVALID_LAYOUT and keeps the previous spec", () => {
    const { core } = make();
    const react = core.forRemote("react");
    react.setLayout({ title: "A" });
    expect(code(() => react.setLayout({ title: 1 as never }))).toBe("INVALID_LAYOUT");
    expect(code(() => react.setLayout(null as never))).toBe("INVALID_LAYOUT");
    expect(core.getView().layout?.title).toBe("A");
  });

  it("stores a deep frozen copy and never invokes onSelect", () => {
    const { core } = make();
    const onSelect = vi.fn();
    const spec = {
      title: "A",
      breadcrumbs: [{ label: "Home", path: "/orders" }],
      actions: [{ id: "x", label: "X", onSelect }],
    };
    core.forRemote("react").setLayout(spec);
    spec.title = "changed";
    spec.actions.push({ id: "y", label: "Y", onSelect });
    spec.actions[0]!.label = "changed";
    spec.breadcrumbs[0]!.label = "changed";
    const layout = core.getView().layout!;
    expect(layout).toEqual({
      title: "A",
      breadcrumbs: [{ label: "Home", path: "/orders" }],
      actions: [{ id: "x", label: "X", onSelect }],
    });
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.actions)).toBe(true);
    expect(Object.isFrozen(layout.actions![0])).toBe(true);
    expect(Object.isFrozen(layout.breadcrumbs)).toBe(true);
    expect(Object.isFrozen(layout.breadcrumbs![0])).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("facade slots", () => {
  it("defers render until the element is attached", () => {
    const { core } = make();
    const { render } = renderer();
    core.forRemote("react").claimSlot("header", render);
    expect(render).not.toHaveBeenCalled();
    const el = fakeEl();
    core.attachSlotElement("header", el);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(el);
  });

  it("renders immediately when the element is already attached", () => {
    const { core } = make();
    const el = fakeEl();
    core.attachSlotElement("sidebar", el);
    const { render } = renderer();
    core.forRemote("react").claimSlot("sidebar", render);
    expect(render).toHaveBeenCalledWith(el);
    expect(el.nodes).toEqual(["content"]);
  });

  it("slots are exclusive until released", () => {
    const { core } = make();
    const release = core.forRemote("react").claimSlot("header", renderer().render);
    const vue = core.forRemote("vue");
    expect(code(() => vue.claimSlot("header", renderer().render))).toBe("SLOT_TAKEN");
    release();
    expect(code(() => vue.claimSlot("header", renderer().render))).toBeUndefined();
  });

  it("release runs cleanup once and empties the element", () => {
    const { core } = make();
    const el = fakeEl();
    core.attachSlotElement("header", el);
    const { render, cleanup } = renderer();
    const release = core.forRemote("react").claimSlot("header", render);
    release();
    release();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(el.nodes).toEqual([]);
  });

  it("a throwing render is contained, empties the element and drops the claim", () => {
    const { core } = make();
    const react = core.forRemote("react");
    const boom = () => {
      (el as FakeEl).nodes = ["partial"];
      throw new Error("boom");
    };
    const el = fakeEl();
    const release = react.claimSlot("header", boom);
    expect(() => core.attachSlotElement("header", el)).not.toThrow();
    expect(el.nodes).toEqual([]);
    expect(() => release()).not.toThrow();
    const again = core.forRemote("vue").claimSlot("header", renderer().render);
    expect(el.nodes).toEqual(["content"]);
    again();
    // same, when the element is already attached at claim time
    expect(() => react.claimSlot("header", boom)).not.toThrow();
    expect(el.nodes).toEqual([]);
    expect(code(() => core.forRemote("vue").claimSlot("header", renderer().render))).toBeUndefined();
  });

  it("a throwing cleanup is contained and the element is emptied", () => {
    const { core } = make();
    const el = fakeEl();
    core.attachSlotElement("header", el);
    const release = core.forRemote("react").claimSlot("header", (e) => {
      (e as FakeEl).nodes = ["content"];
      return () => {
        throw new Error("boom");
      };
    });
    expect(() => release()).not.toThrow();
    expect(el.nodes).toEqual([]);
  });

  it("re-attaching the same element does not render twice", () => {
    const { core } = make();
    const el = fakeEl();
    const { render } = renderer();
    core.forRemote("react").claimSlot("header", render);
    core.attachSlotElement("header", el);
    core.attachSlotElement("header", el);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("detach runs cleanup and keeps the claim; re-attach renders again; release after detach does not clean twice", () => {
    const { core } = make();
    const el = fakeEl();
    const { render, cleanup } = renderer();
    const release = core.forRemote("react").claimSlot("header", render);
    core.attachSlotElement("header", el);
    core.attachSlotElement("header", null);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(el.nodes).toEqual([]);
    expect(code(() => core.forRemote("vue").claimSlot("header", renderer().render))).toBe("SLOT_TAKEN");
    const el2 = fakeEl();
    core.attachSlotElement("header", el2);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(el2);
    core.attachSlotElement("header", null);
    release();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("swapping elements cleans the old one before rendering into the new one", () => {
    const { core } = make();
    const el1 = fakeEl();
    const el2 = fakeEl();
    const { render, cleanup } = renderer();
    core.attachSlotElement("header", el1);
    core.forRemote("react").claimSlot("header", render);
    core.attachSlotElement("header", el2);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(el1.nodes).toEqual([]);
    expect(el2.nodes).toEqual(["content"]);
  });

  it("a render that returns no function is tolerated", () => {
    const { core } = make();
    const el = fakeEl();
    core.attachSlotElement("header", el);
    const release = core.forRemote("react").claimSlot("header", (() => undefined) as never);
    expect(() => release()).not.toThrow();
  });
});

describe("revocation", () => {
  it("revoke releases layout and slots and blocks commands", () => {
    const { core } = make();
    const el = fakeEl();
    core.attachSlotElement("header", el);
    const react = core.forRemote("react");
    const releaseLayout = react.setLayout({ title: "A" });
    const { render, cleanup } = renderer();
    const releaseSlot = react.claimSlot("header", render);
    const onChange = vi.fn();
    core.subscribe(onChange);
    core.revoke("react");
    expect(onChange).toHaveBeenCalled();
    expect(core.getView().layout).toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(el.nodes).toEqual([]);
    expect(code(() => react.setLayout({ title: "B" }))).toBe("FACADE_REVOKED");
    expect(code(() => react.claimSlot("sidebar", render))).toBe("FACADE_REVOKED");
    expect(code(() => react.navigate("/summary"))).toBe("FACADE_REVOKED");
    expect(code(() => react.setLanguage("th"))).toBe("FACADE_REVOKED");
    expect(() => releaseLayout()).not.toThrow();
    expect(() => releaseSlot()).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(react.getState()).toBe(core.getState());
    const listener = vi.fn();
    const off = react.subscribe(listener);
    core.navigate("/summary");
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    expect(() => core.revoke("unknown")).not.toThrow();
  });

  it("forRemote again revokes the old facade; old releases do not touch the new facade", () => {
    const { core } = make();
    const el = fakeEl();
    core.attachSlotElement("header", el);
    const first = core.forRemote("react");
    const oldLayout = first.setLayout({ title: "old" });
    const oldSlot = first.claimSlot("header", renderer().render);
    const second = core.forRemote("react");
    expect(second).not.toBe(first);
    expect(code(() => first.setLayout({ title: "x" }))).toBe("FACADE_REVOKED");
    second.setLayout({ title: "new" });
    const { render, cleanup } = renderer();
    second.claimSlot("header", render);
    oldLayout();
    oldSlot();
    expect(core.getView().layout?.title).toBe("new");
    expect(cleanup).not.toHaveBeenCalled();
    expect(el.nodes).toEqual(["content"]);
    expect(code(() => core.forRemote("vue").claimSlot("header", renderer().render))).toBe("SLOT_TAKEN");
  });

  it("facade navigate and setLanguage work while live and never change contextRevision", () => {
    const { core, session } = make();
    const react = core.forRemote("react");
    expect(react.contractVersion).toBe(1);
    react.navigate("/summary");
    react.setLanguage("th");
    expect(core.getState()).toMatchObject({ path: "/summary", language: "th" });
    expect(session.api.getSnapshot().contextRevision).toBe(0);
  });
});

describe("createShellRuntime facade", () => {
  it("forRemote and attachSlotElement are wired", () => {
    const runtime = createShellRuntime({ session: fakeSession().api, routes, resolveUser });
    const el = fakeEl();
    runtime.attachSlotElement("header", el);
    const react = runtime.forRemote("react");
    react.claimSlot("header", renderer().render);
    react.setLayout({ title: "A" });
    expect(el.nodes).toEqual(["content"]);
    expect(runtime.getView().layout?.title).toBe("A");
  });
});
