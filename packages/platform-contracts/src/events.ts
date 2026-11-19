export const EVENTS_CONTRACT_VERSION = 1 as const;
export const MAX_PAYLOAD_BYTES = 4096;

export type EventMessage<T = unknown> = {
  topic: string;
  payload: T;
  /** Remote id (or "shell") that published */
  from: string;
  contextRevision: number;
  /** Monotonic per channel */
  seq: number;
};

export interface TopicState<T> {
  /** Latest value, or undefined before the first setState */
  get(): T | undefined;
  subscribe(onChange: () => void): () => void;
}

export interface EventsApi {
  readonly contractVersion: typeof EVENTS_CONTRACT_VERSION;
  /** Sync; throws EventsCommandError INVALID_TOPIC | NOT_OWNER | INVALID_PAYLOAD | PAYLOAD_TOO_LARGE | FACADE_REVOKED */
  publish(topic: string, payload: unknown): void;
  /** Returns unsubscribe; throws INVALID_TOPIC | FACADE_REVOKED */
  on(topic: string, handler: (message: EventMessage) => void): () => void;
  /** Owner-only retained value; same errors as publish */
  setState(topic: string, value: unknown): void;
  state<T = unknown>(topic: string): TopicState<T>;
}

export type EventsErrorCode =
  | "INVALID_TOPIC"
  | "NOT_OWNER"
  | "INVALID_PAYLOAD"
  | "PAYLOAD_TOO_LARGE"
  | "FACADE_REVOKED";

export class EventsCommandError extends Error {
  readonly code: EventsErrorCode;
  constructor(code: EventsErrorCode, message: string) {
    super(message);
    this.name = "EventsCommandError";
    this.code = code;
  }
}

const TOPIC_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;

export function assertTopic(topic: string): string {
  if (typeof topic === "string" && TOPIC_PATTERN.test(topic)) {
    return topic;
  }
  throw new EventsCommandError("INVALID_TOPIC", `Invalid topic: ${String(topic)}`);
}

export function topicOwner(topic: string): string {
  return topic.split(".")[0]!;
}

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const child of Object.values(v)) deepFreeze(child);
  }
  return v;
}

/** Payloads are JSON-shaped: only plain objects and arrays (Map/Set/Date/typed arrays are rejected). */
function assertPlain(v: unknown, seen = new Set<object>()): void {
  if (typeof v !== "object" || v === null || seen.has(v)) return;
  seen.add(v);
  const proto = Object.getPrototypeOf(v);
  if (proto !== null && proto !== Object.prototype && proto !== Array.prototype) {
    throw new EventsCommandError("INVALID_PAYLOAD", "Payload must be plain JSON-shaped data");
  }
  for (const child of Object.values(v)) assertPlain(child, seen);
}

/** Structured clone + deep freeze, capped at MAX_PAYLOAD_BYTES of JSON UTF-8. */
export function freezePayload(payload: unknown): unknown {
  let copy: unknown;
  let json: string | undefined;
  try {
    copy = structuredClone(payload);
    // clone accepts cycles and Map/Set/Date; JSON size is the contract's measure
    assertPlain(copy);
    json = JSON.stringify(copy);
  } catch (error) {
    if (error instanceof EventsCommandError) throw error;
    throw new EventsCommandError("INVALID_PAYLOAD", "Payload is not cloneable data");
  }
  if (json !== undefined && new TextEncoder().encode(json).length > MAX_PAYLOAD_BYTES) {
    throw new EventsCommandError("PAYLOAD_TOO_LARGE", `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
  return deepFreeze(copy);
}
