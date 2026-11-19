import {
  EVENTS_CONTRACT_VERSION,
  EventsCommandError,
  assertTopic,
  freezePayload,
  topicOwner,
  type EventMessage,
  type EventsApi,
  type SessionApi,
  type TopicState,
} from "@poc/platform-contracts";

export type BrokerMessage = EventMessage & { kind: "event" | "state" };

export type EventBrokerOptions = { session: SessionApi };

export interface EventBroker {
  /** Revokes any previous facade (and its subscriptions and retained topics) for this id */
  forRemote(remoteId: string): EventsApi;
  /** Revoke: drop subscriptions, clear the remote's retained topics */
  unregisterRemote(remoteId: string): void;
  /** Topic must be shell.* */
  publishFromShell(topic: string, payload: unknown): void;
  /** Retained, shell.* only */
  setShellState(topic: string, value: unknown): void;
  /** Sees every accepted event and state change, for the event log */
  observe(onMessage: (m: BrokerMessage) => void): () => void;
  dispose(): void;
}

type Facade = { remoteId: string; revoked: boolean; unsubscribers: Set<() => void> };
/** Subscriptions remember their facade so delivery can skip one revoked mid-drain; shell-side ones have none. */
type Sub<F> = { fn: F; facade?: Facade };
type Handler = (message: EventMessage) => void;

const SHELL = "shell";

/** Internal: topic namespaces, retained state and synchronous, isolated, FIFO delivery. */
export function createEventBroker(options: EventBrokerOptions): EventBroker {
  const { session } = options;

  const handlers = new Map<string, Set<Sub<Handler>>>();
  const stateListeners = new Map<string, Set<Sub<() => void>>>();
  const retained = new Map<string, { value: unknown; json: string | undefined }>();
  const observers = new Set<(m: BrokerMessage) => void>();
  const facades = new Map<string, Facade>();

  let disposed = false;
  const assertLive = () => {
    if (disposed) throw new EventsCommandError("FACADE_REVOKED", "Event broker was disposed");
  };
  /** "shell" belongs to the shell only; remotes can never hold that id. */
  const assertRemoteId = (remoteId: string) => {
    if (remoteId === SHELL) throw new EventsCommandError("NOT_OWNER", `Remote id "${SHELL}" is reserved for the shell`);
  };

  let seq = 0;
  const queue: BrokerMessage[] = [];
  let draining = false;

  const guarded = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      // one subscriber's failure must not skip the others (or the publisher)
      console.error("[event-broker] subscriber failed", error);
    }
  };

  const deliver = (message: BrokerMessage) => {
    for (const observer of [...observers]) guarded(() => observer(message));
    if (message.kind === "event") {
      const { kind: _kind, ...plain } = message;
      for (const sub of [...(handlers.get(message.topic) ?? [])]) {
        if (!sub.facade?.revoked) guarded(() => sub.fn(plain));
      }
    } else {
      for (const sub of [...(stateListeners.get(message.topic) ?? [])]) {
        if (!sub.facade?.revoked) guarded(sub.fn);
      }
    }
  };

  /** FIFO; a message enqueued from inside a handler waits until the current one finished. */
  const enqueue = (kind: BrokerMessage["kind"], topic: string, payload: unknown, from: string) => {
    queue.push({ kind, topic, payload, from, contextRevision: session.getSnapshot().contextRevision, seq: ++seq });
    if (draining) return;
    draining = true;
    try {
      for (let next = queue.shift(); next; next = queue.shift()) deliver(next);
    } finally {
      draining = false;
    }
  };

  const assertOwner = (from: string, topic: string) => {
    if (topicOwner(topic) !== from) {
      throw new EventsCommandError("NOT_OWNER", `${from} cannot write to ${topic}`);
    }
  };

  const add = <V>(map: Map<string, Set<V>>, topic: string, value: V) => {
    let set = map.get(topic);
    if (!set) map.set(topic, (set = new Set()));
    set.add(value);
    return () => {
      set.delete(value);
      if (set.size === 0 && map.get(topic) === set) map.delete(topic);
    };
  };

  const publish = (from: string, topic: string, payload: unknown) => {
    assertTopic(topic);
    assertOwner(from, topic);
    enqueue("event", topic, freezePayload(payload), from);
  };

  const setState = (from: string, topic: string, value: unknown) => {
    assertTopic(topic);
    assertOwner(from, topic);
    const frozen = freezePayload(value);
    const json = JSON.stringify(frozen);
    // unchanged value keeps identity and does not notify
    if (retained.has(topic) && retained.get(topic)!.json === json) return;
    retained.set(topic, { value: frozen, json });
    enqueue("state", topic, frozen, from);
  };

  const revoke = (facade: Facade) => {
    facade.revoked = true;
    for (const unsubscribe of [...facade.unsubscribers]) unsubscribe();
    facade.unsubscribers.clear();
  };

  const unregisterRemote = (remoteId: string) => {
    assertRemoteId(remoteId);
    const facade = facades.get(remoteId);
    if (facade) revoke(facade);
    facades.delete(remoteId);
    for (const topic of [...retained.keys()]) {
      if (topicOwner(topic) !== remoteId) continue;
      retained.delete(topic);
      enqueue("state", topic, undefined, remoteId);
    }
  };

  const forRemote = (remoteId: string): EventsApi => {
    assertLive();
    unregisterRemote(remoteId);
    const facade: Facade = { remoteId, revoked: false, unsubscribers: new Set() };
    facades.set(remoteId, facade);
    const live = () => {
      if (facade.revoked) throw new EventsCommandError("FACADE_REVOKED", `Events facade for ${remoteId} was revoked`);
    };
    const track = (unsubscribe: () => void) => {
      facade.unsubscribers.add(unsubscribe);
      return () => {
        facade.unsubscribers.delete(unsubscribe);
        unsubscribe();
      };
    };
    return Object.freeze({
      contractVersion: EVENTS_CONTRACT_VERSION,
      publish(topic, payload) {
        live();
        publish(remoteId, topic, payload);
      },
      on(topic, handler) {
        live();
        assertTopic(topic);
        return track(add(handlers, topic, { fn: handler, facade }));
      },
      setState(topic, value) {
        live();
        setState(remoteId, topic, value);
      },
      state<T = unknown>(topic: string): TopicState<T> {
        live();
        assertTopic(topic);
        return {
          get: () => {
            live();
            return retained.get(topic)?.value as T | undefined;
          },
          subscribe: (onChange) => {
            live();
            return track(add(stateListeners, topic, { fn: onChange, facade }));
          },
        };
      },
    } satisfies EventsApi);
  };

  return {
    forRemote,
    unregisterRemote,
    publishFromShell(topic, payload) {
      assertLive();
      publish(SHELL, topic, payload);
    },
    setShellState(topic, value) {
      assertLive();
      setState(SHELL, topic, value);
    },
    observe(onMessage) {
      observers.add(onMessage);
      return () => observers.delete(onMessage);
    },
    dispose() {
      disposed = true;
      for (const facade of facades.values()) revoke(facade);
      facades.clear();
      handlers.clear();
      stateListeners.clear();
      retained.clear();
      observers.clear();
      queue.length = 0;
    },
  };
}
