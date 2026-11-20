import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENTS_CONTRACT_VERSION,
  SESSION_CONTRACT_VERSION,
  type EventMessage,
  type SessionApi,
} from "@poc/platform-contracts";
import { createEventBroker, type BrokerMessage } from "./createEventBroker";

function fakeSession(contextRevision = 3): SessionApi {
  return {
    contractVersion: SESSION_CONTRACT_VERSION,
    getSnapshot: () => ({ status: "anonymous", contextRevision }),
    subscribe: () => () => {},
    requestLogin: vi.fn(),
    requestLogout: vi.fn(),
    requestAccountChange: vi.fn(),
  };
}

const setup = () => {
  const broker = createEventBroker({ session: fakeSession() });
  return { broker, events: broker.forRemote("events"), react: broker.forRemote("react") };
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

afterEach(() => vi.restoreAllMocks());

describe("createEventBroker", () => {
  it("delivers events with broker-set from, revision and increasing seq", () => {
    const { events, react } = setup();
    const got: EventMessage[] = [];
    react.on("events.ping", (m) => got.push(m));
    events.publish("events.ping", { from: "spoof", n: 1 });
    events.publish("events.ping", { n: 2 });
    expect(got[0]).toEqual({ topic: "events.ping", payload: { from: "spoof", n: 1 }, from: "events", contextRevision: 3, seq: got[0]!.seq });
    expect(got[1]!.seq).toBeGreaterThan(got[0]!.seq);
    expect(events.contractVersion).toBe(EVENTS_CONTRACT_VERSION);
  });

  it("enforces topic grammar and namespace ownership", () => {
    const { events, broker } = setup();
    expect(code(() => events.publish("react.x", 1))).toBe("NOT_OWNER");
    expect(code(() => events.publish("shell.x", 1))).toBe("NOT_OWNER");
    expect(code(() => events.setState("react.x", 1))).toBe("NOT_OWNER");
    expect(code(() => events.publish("BAD", 1))).toBe("INVALID_TOPIC");
    expect(code(() => events.on("BAD", () => {}))).toBe("INVALID_TOPIC");
    expect(code(() => events.state("BAD"))).toBe("INVALID_TOPIC");
    expect(code(() => broker.publishFromShell("events.x", 1))).toBe("NOT_OWNER");
    expect(code(() => broker.setShellState("events.x", 1))).toBe("NOT_OWNER");
  });

  it("retains state with stable identity and notifies only on change of that topic", () => {
    const { events, react } = setup();
    const topic = react.state<number>("events.counter");
    const other = react.state("events.other");
    const onChange = vi.fn();
    const onOther = vi.fn();
    topic.subscribe(onChange);
    other.subscribe(onOther);
    expect(topic.get()).toBeUndefined();
    events.setState("events.counter", 1);
    expect(react.state<number>("events.counter").get()).toBe(1);
    events.setState("events.counter", 1);
    expect(onChange).toHaveBeenCalledTimes(1);
    events.setState("events.obj", { a: 1 });
    const first = react.state("events.obj").get();
    events.setState("events.obj", { a: 1 });
    expect(react.state("events.obj").get()).toBe(first);
    events.setState("events.counter", 2);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onOther).not.toHaveBeenCalled();
  });

  it("does not replay events to late subscribers", () => {
    const { events, react } = setup();
    events.publish("events.ping", 1);
    const handler = vi.fn();
    react.on("events.ping", handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers a frozen envelope so one handler cannot spoof the sender for the next", () => {
    const { events, react, broker } = setup();
    const other = broker.forRemote("other");
    let seen: EventMessage | undefined;
    react.on("events.ping", (m) => {
      try {
        (m as { from: string }).from = "shell";
        (m as { payload: unknown }).payload = "tampered";
      } catch {
        // frozen envelope throws in strict mode
      }
    });
    other.on("events.ping", (m) => (seen = m));
    events.publish("events.ping", { n: 1 });
    expect(seen).toMatchObject({ from: "events", payload: { n: 1 } });
    expect(Object.isFrozen(seen)).toBe(true);
  });

  it("isolates throwing handlers", () => {
    const { events, react } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const next = vi.fn();
    react.on("events.ping", () => {
      throw new Error("boom");
    });
    react.on("events.ping", next);
    expect(() => events.publish("events.ping", 1)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("queues messages published during delivery in order", () => {
    const { events, react } = setup();
    const order: string[] = [];
    react.on("events.a", () => {
      order.push("a-start");
      events.publish("events.b", 1);
      order.push("a-end");
    });
    react.on("events.a", () => order.push("a2"));
    react.on("events.b", () => order.push("b"));
    events.publish("events.a", 1);
    expect(order).toEqual(["a-start", "a-end", "a2", "b"]);
  });

  it("lets the shell publish shell.* events", () => {
    const { broker, react } = setup();
    const handler = vi.fn();
    react.on("shell.notice", handler);
    broker.publishFromShell("shell.notice", { m: 1 });
    expect(handler.mock.calls[0]![0]).toMatchObject({ from: "shell", payload: { m: 1 }, contextRevision: 3 });
    broker.setShellState("shell.mode", "x");
    expect(react.state("shell.mode").get()).toBe("x");
  });

  it("unregisterRemote drops subs, retained topics and revokes the facade", () => {
    const { broker, events, react } = setup();
    const handler = vi.fn();
    const stateChange = vi.fn();
    events.on("react.ping", handler);
    events.setState("events.counter", 1);
    react.state("events.counter").subscribe(stateChange);
    broker.unregisterRemote("events");
    expect(stateChange).toHaveBeenCalledTimes(1);
    expect(react.state("events.counter").get()).toBeUndefined();
    react.publish("react.ping", 1);
    expect(handler).not.toHaveBeenCalled();
    for (const fn of [
      () => events.publish("events.a", 1),
      () => events.on("events.a", () => {}),
      () => events.setState("events.a", 1),
      () => events.state("events.a"),
    ]) {
      expect(code(fn)).toBe("FACADE_REVOKED");
    }
  });

  it("forRemote revokes the previous facade for the same id", () => {
    const { broker, events } = setup();
    const again = broker.forRemote("events");
    expect(code(() => events.publish("events.a", 1))).toBe("FACADE_REVOKED");
    expect(() => again.publish("events.a", 1)).not.toThrow();
  });

  it("observe sees accepted events and state changes", () => {
    const { broker, events } = setup();
    const seen: BrokerMessage[] = [];
    const stop = broker.observe((m) => seen.push(m));
    events.publish("events.ping", 1);
    events.setState("events.counter", 5);
    events.setState("events.counter", 5);
    expect(seen.map((m) => [m.kind, m.topic, m.payload])).toEqual([
      ["event", "events.ping", 1],
      ["state", "events.counter", 5],
    ]);
    stop();
    events.publish("events.ping", 2);
    expect(seen).toHaveLength(2);
  });

  it("clones and freezes payloads", () => {
    const { events, react } = setup();
    const got: EventMessage[] = [];
    react.on("events.ping", (m) => got.push(m));
    const payload = { a: { b: 1 } };
    events.publish("events.ping", payload);
    payload.a.b = 2;
    expect(got[0]!.payload).toEqual({ a: { b: 1 } });
    expect(Object.isFrozen(got[0]!.payload)).toBe(true);
    expect(code(() => events.publish("events.ping", "x".repeat(5000)))).toBe("PAYLOAD_TOO_LARGE");
  });

  it("dispose revokes facades and stops delivery", () => {
    const { broker, events } = setup();
    broker.dispose();
    expect(code(() => events.publish("events.a", 1))).toBe("FACADE_REVOKED");
    expect(code(() => broker.forRemote("x"))).toBe("FACADE_REVOKED");
    expect(code(() => broker.publishFromShell("shell.a", 1))).toBe("FACADE_REVOKED");
    expect(code(() => broker.setShellState("shell.a", 1))).toBe("FACADE_REVOKED");
  });

  it("reserves the shell id", () => {
    const { broker, react } = setup();
    broker.setShellState("shell.mode", "x");
    expect(code(() => broker.forRemote("shell"))).toBe("NOT_OWNER");
    expect(code(() => broker.unregisterRemote("shell"))).toBe("NOT_OWNER");
    expect(react.state("shell.mode").get()).toBe("x");
  });

  it("skips a handler whose facade was revoked earlier in the same delivery", () => {
    const { broker, events } = setup();
    const x = broker.forRemote("x");
    const late = vi.fn();
    events.on("events.ping", () => broker.unregisterRemote("x"));
    x.on("events.ping", late);
    events.publish("events.ping", 1);
    expect(late).not.toHaveBeenCalled();
  });
});

function controlledSession(contextRevision = 3) {
  let snap: { status: "anonymous" | "authenticated" | "transitioning"; contextRevision: number } = {
    status: "authenticated",
    contextRevision,
  };
  const subs = new Set<() => void>();
  const session: SessionApi = {
    ...fakeSession(),
    getSnapshot: () => snap,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  return {
    session,
    subs,
    set(status: typeof snap.status, rev = snap.contextRevision) {
      snap = { status, contextRevision: rev };
      for (const fn of [...subs]) fn();
    },
  };
}
const lifecycle = () => ({
  prepareTransition: vi.fn(async () => {}),
  resetIdentityState: vi.fn(async () => {}),
  resume: vi.fn(async () => {}),
  block: vi.fn(),
  dispose: vi.fn(),
});

describe("createEventBroker transitions", () => {
  const setupT = () => {
    const ctl = controlledSession();
    const broker = createEventBroker({ session: ctl.session });
    return { ...ctl, broker, events: broker.forRemote("events"), react: broker.forRemote("react") };
  };

  it("clears retained non-shell state once, keeps shell.*, drops queued events", () => {
    const { set, broker, events, react } = setupT();
    broker.setShellState("shell.lang", "en");
    events.setState("events.counter", 1);
    const onChange = vi.fn();
    react.state("events.counter").subscribe(onChange);
    const got: unknown[] = [];
    react.on("events.ping", (m) => got.push(m));
    // an event queued behind a draining one is dropped when a transition lands mid-delivery
    react.on("events.first", () => {
      events.publish("events.ping", 1);
      set("transitioning");
    });
    events.publish("events.first", 0);
    expect(got).toEqual([]);
    expect(react.state("events.counter").get()).toBeUndefined();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(react.state("shell.lang").get()).toBe("en");
  });

  it("stops delivering the message in flight once a transition starts", () => {
    const { set, events, react } = setupT();
    const second = vi.fn();
    react.on("events.ping", () => set("transitioning"));
    react.on("events.ping", second);
    events.publish("events.ping", 1);
    expect(second).not.toHaveBeenCalled();
  });

  it("silently drops remote and shell publishes and remote setState while transitioning", () => {
    const { set, broker, events, react } = setupT();
    const seen: BrokerMessage[] = [];
    broker.observe((m) => seen.push(m));
    const got: unknown[] = [];
    react.on("events.ping", (m) => got.push(m));
    react.on("shell.note", (m) => got.push(m));
    set("transitioning");
    seen.length = 0;
    expect(() => events.publish("events.ping", 1)).not.toThrow();
    expect(() => events.setState("events.counter", 2)).not.toThrow();
    broker.publishFromShell("shell.note", 1);
    expect(got).toEqual([]);
    expect(seen).toEqual([]);
    expect(react.state("events.counter").get()).toBeUndefined();
  });

  it("still applies setShellState and allows on()/state() during a transition", () => {
    const { set, broker, react } = setupT();
    set("transitioning");
    const onChange = vi.fn();
    expect(() => react.on("events.x", () => {})).not.toThrow();
    react.state("shell.mode").subscribe(onChange);
    broker.setShellState("shell.mode", "x");
    expect(react.state("shell.mode").get()).toBe("x");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("resumes with the new contextRevision after the transition", () => {
    const { set, events, react } = setupT();
    const got: EventMessage[] = [];
    react.on("events.ping", (m) => got.push(m));
    set("transitioning", 4);
    set("authenticated", 4);
    events.publish("events.ping", 1);
    expect(got[0]!.contextRevision).toBe(4);
  });

  it("unsubscribes from the session on dispose", () => {
    const { broker, subs } = setupT();
    expect(subs.size).toBe(1);
    broker.dispose();
    expect(subs.size).toBe(0);
  });

  it("starts in transitioning if the session already is", () => {
    const ctl = controlledSession();
    ctl.set("transitioning");
    const broker = createEventBroker({ session: ctl.session });
    const events = broker.forRemote("events");
    const seen: BrokerMessage[] = [];
    broker.observe((m) => seen.push(m));
    events.publish("events.ping", 1);
    expect(seen).toEqual([]);
  });
});

describe("registerRemote", () => {
  const setupR = () => {
    const broker = createEventBroker({ session: controlledSession().session });
    return broker;
  };

  it("block revokes the facade and calls the inner block", () => {
    const broker = setupR();
    const lc = lifecycle();
    const wrapped = broker.registerRemote("events", lc);
    const api = broker.forRemote("events");
    wrapped.block({ type: "timeout", message: "t" });
    expect(code(() => api.publish("events.x", 1))).toBe("FACADE_REVOKED");
    expect(lc.block).toHaveBeenCalledTimes(1);
  });

  it("dispose revokes the facade and calls the inner dispose", () => {
    const broker = setupR();
    const lc = lifecycle();
    const wrapped = broker.registerRemote("events", lc);
    const api = broker.forRemote("events");
    wrapped.dispose();
    expect(code(() => api.publish("events.x", 1))).toBe("FACADE_REVOKED");
    expect(lc.dispose).toHaveBeenCalledTimes(1);
  });

  it("delegates prepareTransition, resetIdentityState and resume", async () => {
    const broker = setupR();
    const lc = lifecycle();
    const wrapped = broker.registerRemote("events", lc);
    const ctx = { fromRevision: 1, toRevision: 2, signal: new AbortController().signal };
    await wrapped.prepareTransition(ctx);
    await wrapped.resetIdentityState(ctx);
    await wrapped.resume(ctx);
    expect(lc.prepareTransition).toHaveBeenCalledWith(ctx);
    expect(lc.resetIdentityState).toHaveBeenCalledWith(ctx);
    expect(lc.resume).toHaveBeenCalledWith(ctx);
  });

  it("re-forRemote revokes the old facade and its handlers never fire again", () => {
    const broker = setupR();
    const old = broker.forRemote("react");
    const fn = vi.fn();
    old.on("events.ping", fn);
    const events = broker.forRemote("events");
    broker.forRemote("react");
    events.publish("events.ping", 1);
    expect(fn).not.toHaveBeenCalled();
    expect(code(() => old.publish("react.x", 1))).toBe("FACADE_REVOKED");
  });

  it("a stale wrapper does not revoke the current facade", () => {
    const broker = setupR();
    const stale = broker.registerRemote("events", lifecycle());
    broker.registerRemote("events", lifecycle());
    const api = broker.forRemote("events");
    stale.block({ type: "timeout", message: "t" });
    stale.dispose();
    expect(code(() => api.publish("events.x", 1))).toBeUndefined();
  });
});
