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
