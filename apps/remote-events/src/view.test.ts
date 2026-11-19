// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { EventMessage, EventsApi } from "@poc/platform-contracts";
import { createView } from "./view";

function fakeEvents() {
  const states = new Map<string, unknown>();
  const stateSubs = new Map<string, Set<() => void>>();
  const handlers = new Map<string, Set<(m: EventMessage) => void>>();
  const api = {
    contractVersion: 1,
    publish: vi.fn(),
    setState: vi.fn((topic: string, value: unknown) => {
      states.set(topic, value);
      stateSubs.get(topic)?.forEach((f) => f());
    }),
    on: vi.fn((topic: string, h: (m: EventMessage) => void) => {
      const set = handlers.get(topic) ?? new Set();
      set.add(h);
      handlers.set(topic, set);
      return () => set.delete(h);
    }),
    state: (topic: string) => ({
      get: () => states.get(topic),
      subscribe: (f: () => void) => {
        const set = stateSubs.get(topic) ?? new Set();
        set.add(f);
        stateSubs.set(topic, set);
        return () => set.delete(f);
      },
    }),
  } as unknown as EventsApi;
  const emit = (topic: string, payload: unknown) =>
    handlers.get(topic)?.forEach((h) => h({ topic, payload, from: "shell", contextRevision: 1, seq: 1 }));
  return { api, states, stateSubs, handlers, emit };
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const ctx = { fromRevision: 1, toRevision: 2, signal: new AbortController().signal };

describe("events view", () => {
  it("shows unavailable without events", () => {
    const el = document.createElement("div");
    const v = createView(el, {});
    expect(el.textContent).toContain("events unavailable");
    expect(el.querySelector('[data-testid="events-ping"]')).toBeNull();
    v.dispose();
  });

  it("renders shell state and notice, ping publishes and retains counter", () => {
    const f = fakeEvents();
    f.states.set("shell.path", "/orders");
    f.states.set("shell.user", { subjectId: "u", displayName: "Ada" });
    const el = document.createElement("div");
    const v = createView(el, { events: f.api });
    expect(q(el, "events-shell-path").textContent).toBe("/orders");
    expect(q(el, "events-shell-user").textContent).toBe("Ada");
    f.emit("shell.notice", { text: "hello" });
    expect(q(el, "events-last-notice").textContent).toBe("hello");
    q(el, "events-ping").click();
    expect(f.api.publish).toHaveBeenCalledWith("events.ping", { n: 1 });
    expect(f.api.setState).toHaveBeenCalledWith("events.counter", 1);
    expect(q(el, "events-counter").textContent).toBe("1");
    v.dispose();
    v.dispose();
    expect(el.children.length).toBe(0);
  });

  it("resets, resumes with retained counter, and blocks without commands", async () => {
    const f = fakeEvents();
    const el = document.createElement("div");
    const v = createView(el, { events: f.api });
    q(el, "events-ping").click();
    f.emit("react.ack", { n: 1 });
    await v.resetIdentityState();
    expect(q(el, "events-counter").textContent).toBe("0");
    expect(q(el, "events-last-ack").textContent).toBe("—");
    q(el, "events-ping").click();
    q(el, "events-ping").click();
    f.api.setState = vi.fn();
    v.resume();
    expect(f.api.setState).toHaveBeenCalledWith("events.counter", 2);
    f.api.publish = vi.fn();
    v.block("nope");
    expect(el.textContent).toContain("nope");
    v.dispose();
    expect(f.api.publish).not.toHaveBeenCalled();
  });

  it("fails cleanup when forced and tolerates FACADE_REVOKED", async () => {
    const f = fakeEvents();
    const el = document.createElement("div");
    const v = createView(el, { events: f.api, forceCleanupFail: true });
    await expect(v.resetIdentityState()).rejects.toThrow("forced cleanup failure");
    const err = Object.assign(new Error("x"), { name: "EventsCommandError", code: "FACADE_REVOKED" });
    f.api.publish = vi.fn(() => { throw err; });
    expect(() => q(el, "events-ping").click()).not.toThrow();
    f.api.setState = vi.fn(() => { throw new Error("boom"); });
    expect(() => v.resume()).toThrow("boom");
  });
});
