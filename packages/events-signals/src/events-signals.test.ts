import { describe, expect, it, vi } from "vitest";
import { effect, signal as signalA } from "@preact/signals-core";
import type { EventMessage, EventsApi } from "@poc/platform-contracts";
import { eventSignal, topicSignal } from "./index";

function fakeEvents() {
  let value: unknown;
  const stateListeners = new Set<() => void>();
  const handlers = new Set<(m: EventMessage) => void>();
  const api = {
    contractVersion: 1,
    publish() {},
    setState() {},
    on(_t: string, h: (m: EventMessage) => void) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    state: () => ({
      get: () => value,
      subscribe(cb: () => void) {
        stateListeners.add(cb);
        return () => stateListeners.delete(cb);
      },
    }),
  } as unknown as EventsApi;
  return {
    api,
    set(v: unknown) {
      value = v;
      stateListeners.forEach((l) => l());
    },
    emit(m: EventMessage) {
      handlers.forEach((h) => h(m));
    },
    listeners: () => stateListeners.size + handlers.size,
  };
}

const msg = (payload: unknown, seq = 1): EventMessage => ({
  topic: "a.b", payload, from: "x", contextRevision: 1, seq,
});

describe("topicSignal", () => {
  it("starts at the retained value, updates, and stops after dispose", () => {
    const f = fakeEvents();
    f.set(1);
    const t = topicSignal<number>(f.api, "a.b");
    expect(t.signal.value).toBe(1);
    f.set(2);
    expect(t.signal.value).toBe(2);
    t.dispose();
    expect(f.listeners()).toBe(0);
    f.set(3);
    expect(t.signal.value).toBe(2);
  });

  it("re-runs an effect from the same signals-core copy", () => {
    const f = fakeEvents();
    const t = topicSignal<number>(f.api, "a.b");
    const seen: unknown[] = [];
    const stop = effect(() => void seen.push(t.signal.value));
    f.set(5);
    stop();
    expect(seen).toEqual([undefined, 5]);
  });
});

describe("topicSignal on a revoked facade", () => {
  it("throws at creation (fail closed)", () => {
    const api = {
      state: () => {
        throw Object.assign(new Error("revoked"), { name: "EventsCommandError", code: "FACADE_REVOKED" });
      },
    } as unknown as EventsApi;
    expect(() => topicSignal(api, "a.b")).toThrow("revoked");
  });
});

describe("eventSignal", () => {
  it("holds the latest message and stops after dispose", () => {
    const f = fakeEvents();
    const e = eventSignal<string>(f.api, "a.b");
    expect(e.signal.value).toBeUndefined();
    f.emit(msg("one", 1));
    f.emit(msg("two", 2));
    expect(e.signal.value?.payload).toBe("two");
    e.dispose();
    expect(f.listeners()).toBe(0);
    f.emit(msg("three", 3));
    expect(e.signal.value?.payload).toBe("two");
  });
});

describe("two signals-core copies", () => {
  it("do not track each other, and an adapter bound to one copy works with that copy's effect", async () => {
    vi.resetModules();
    const copyB = await import("@preact/signals-core");
    expect(copyB.signal).not.toBe(signalA);

    const a = signalA(0);
    let runs = 0;
    const stop = copyB.effect(() => {
      void a.value;
      runs++;
    });
    a.value = 1;
    stop();
    expect(runs).toBe(1); // copy B's effect never subscribed to copy A's signal

    const adapterB = await import("./index");
    const f = fakeEvents();
    const t = adapterB.topicSignal<number>(f.api, "a.b");
    const seen: unknown[] = [];
    const stopB = copyB.effect(() => void seen.push(t.signal.value));
    f.set(9);
    stopB();
    expect(seen).toEqual([undefined, 9]);
  });
});
