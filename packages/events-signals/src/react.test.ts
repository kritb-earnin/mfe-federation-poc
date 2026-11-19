// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { EventsApi } from "@poc/platform-contracts";
import { useTopic } from "./react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fake(initial: unknown) {
  let value = initial;
  const ls = new Set<() => void>();
  const api = {
    state: () => ({
      get: () => value,
      subscribe: (cb: () => void) => (ls.add(cb), () => ls.delete(cb)),
    }),
  } as unknown as EventsApi;
  return { api, set: (v: unknown) => ((value = v), ls.forEach((l) => l())) };
}

function render(events: EventsApi | undefined) {
  const el = document.createElement("div");
  const root = createRoot(el);
  const Probe = () => createElement("span", null, String(useTopic<string>(events, "a.b")));
  act(() => root.render(createElement(Probe)));
  return { el, unmount: () => act(() => root.unmount()) };
}

describe("useTopic", () => {
  it("renders the retained value and rerenders on change", () => {
    const f = fake("one");
    const r = render(f.api);
    expect(r.el.textContent).toBe("one");
    act(() => f.set("two"));
    expect(r.el.textContent).toBe("two");
    r.unmount();
  });

  it("returns undefined without events", () => {
    const r = render(undefined);
    expect(r.el.textContent).toBe("undefined");
    r.unmount();
  });

  it("subscribes once across re-renders even when state() allocates per call", () => {
    let subs = 0;
    const api = {
      state: () => ({ get: () => "v", subscribe: () => (subs++, () => {}) }),
    } as unknown as EventsApi;
    const el = document.createElement("div");
    const root = createRoot(el);
    const Probe = () => createElement("span", null, String(useTopic<string>(api, "a.b")));
    for (let i = 0; i < 4; i++) act(() => root.render(createElement(Probe)));
    expect(subs).toBe(1);
    act(() => root.unmount());
  });

  const throwing = (code: string) =>
    ({
      state: () => {
        throw Object.assign(new Error(code), { name: "EventsCommandError", code });
      },
    }) as unknown as EventsApi;

  it("returns undefined for a revoked facade without throwing", () => {
    const r = render(throwing("FACADE_REVOKED"));
    expect(r.el.textContent).toBe("undefined");
    r.unmount();
  });

  it("rethrows other errors", () => {
    expect(() => render(throwing("INVALID_TOPIC"))).toThrow("INVALID_TOPIC");
  });
});
