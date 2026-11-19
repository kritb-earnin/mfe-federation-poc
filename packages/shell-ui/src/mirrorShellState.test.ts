import { describe, expect, it, vi } from "vitest";
import { SESSION_CONTRACT_VERSION, type SessionApi } from "@poc/platform-contracts";
import { createEventBroker } from "@poc/event-broker";
import { createShellRuntime } from "@poc/shell-state";
import { mirrorShellState } from "./mirrorShellState";

const session: SessionApi = {
  contractVersion: SESSION_CONTRACT_VERSION,
  getSnapshot: () => ({ status: "anonymous", contextRevision: 0 }),
  subscribe: () => () => {},
  requestLogin: vi.fn(),
  requestLogout: vi.fn(),
  requestAccountChange: vi.fn(),
};

function setup() {
  const runtime = createShellRuntime({
    session,
    routes: { "/orders": "react", "/summary": "vue" },
    resolveUser: (subjectId) => ({ subjectId, displayName: subjectId }),
  });
  const events = createEventBroker({ session });
  const seen: string[] = [];
  events.observe((m) => seen.push(`${m.topic}`));
  const reader = events.forRemote("reader");
  return { runtime, events, reader, seen };
}

describe("mirrorShellState", () => {
  it("publishes the current state on mount and follows navigation and language", () => {
    const { runtime, events, reader } = setup();
    const stop = mirrorShellState(runtime, events);
    expect(reader.state("shell.path").get()).toBe("/orders");
    expect(reader.state("shell.language").get()).toBe(runtime.getState().language);
    expect(reader.state("shell.user").get()).toBeNull();
    runtime.shellNavigate("/summary");
    expect(reader.state("shell.path").get()).toBe("/summary");
    stop();
  });

  it("writes nothing for unchanged values and stops after cleanup", () => {
    const { runtime, events, reader, seen } = setup();
    const stop = mirrorShellState(runtime, events);
    seen.length = 0;
    runtime.shellNavigate("/orders"); // unchanged path
    expect(seen).toEqual([]);
    runtime.shellNavigate("/summary");
    expect(seen).toEqual(["shell.path"]);
    stop();
    runtime.shellNavigate("/orders");
    expect(reader.state("shell.path").get()).toBe("/summary");
  });
});

describe("mirrorShellState across a session transition", () => {
  it("resets shell.user to null and shell.path to its route root", () => {
    let snap: { status: "authenticated" | "transitioning"; contextRevision: number; subjectId?: string } = {
      status: "authenticated",
      contextRevision: 1,
      subjectId: "acct-1",
    };
    const subs = new Set<() => void>();
    const fake: SessionApi = {
      ...session,
      getSnapshot: () => snap as ReturnType<SessionApi["getSnapshot"]>,
      subscribe: (fn) => (subs.add(fn), () => subs.delete(fn)),
    };
    const runtime = createShellRuntime({
      session: fake,
      routes: { "/orders": "react", "/summary": "vue" },
      resolveUser: (subjectId) => ({ subjectId, displayName: subjectId }),
    });
    const events = createEventBroker({ session: fake });
    const reader = events.forRemote("reader");
    const stop = mirrorShellState(runtime, events);
    runtime.shellNavigate("/orders/123");
    expect(reader.state("shell.path").get()).toBe("/orders/123");
    expect(reader.state("shell.user").get()).not.toBeNull();
    snap = { status: "transitioning", contextRevision: 2 };
    subs.forEach((fn) => fn());
    expect(reader.state("shell.user").get()).toBeNull();
    expect(reader.state("shell.path").get()).toBe("/orders");
    stop();
  });
});
