import { describe, expect, it } from "vitest";
import {
  EventsCommandError,
  MAX_PAYLOAD_BYTES,
  assertTopic,
  freezePayload,
  topicOwner,
} from "./index";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect((e as Error).name).toBe("EventsCommandError");
    return (e as EventsCommandError).code;
  }
  return undefined;
};

describe("assertTopic", () => {
  it.each(["shell.path", "events.counter", "a-b.c-d.e"])("accepts %s", (t) => {
    expect(assertTopic(t)).toBe(t);
  });
  it.each(["Shell.path", "shell", "shell.", ".x", "__proto__.x", "a..b", "1a.b"])(
    "rejects %s",
    (t) => {
      expect(code(() => assertTopic(t))).toBe("INVALID_TOPIC");
    },
  );
  it("rejects non-strings", () => {
    expect(code(() => assertTopic(1 as unknown as string))).toBe("INVALID_TOPIC");
  });
});

describe("topicOwner", () => {
  it("returns the first segment", () => {
    expect(topicOwner("events.counter")).toBe("events");
  });
});

describe("freezePayload", () => {
  it("returns a deep-frozen copy", () => {
    const input = { a: [1] };
    const out = freezePayload(input) as { a: number[] };
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out.a)).toBe(true);
  });
  it("rejects uncloneable payloads", () => {
    expect(code(() => freezePayload(() => {}))).toBe("INVALID_PAYLOAD");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(code(() => freezePayload(circular))).toBe("INVALID_PAYLOAD");
  });
  it("enforces the 4096 byte limit on serialized UTF-8", () => {
    const pad = MAX_PAYLOAD_BYTES - 2; // JSON adds two quotes
    expect(code(() => freezePayload("x".repeat(pad)))).toBeUndefined();
    expect(code(() => freezePayload("x".repeat(pad + 1)))).toBe("PAYLOAD_TOO_LARGE");
    // multi-byte: 3 bytes per char
    expect(code(() => freezePayload("€".repeat(1366)))).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("EventsCommandError", () => {
  it("has a stable name and code", () => {
    const e = new EventsCommandError("NOT_OWNER", "x");
    expect(e.name).toBe("EventsCommandError");
    expect(e.code).toBe("NOT_OWNER");
  });
});
