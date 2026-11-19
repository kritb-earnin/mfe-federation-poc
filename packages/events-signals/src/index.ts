import { signal, type ReadonlySignal } from "@preact/signals-core";
import type { EventMessage, EventsApi } from "@poc/platform-contracts";

export type { ReadonlySignal };

export function topicSignal<T>(
  events: EventsApi,
  topic: string,
): { signal: ReadonlySignal<T | undefined>; dispose(): void } {
  const state = events.state<T>(topic);
  const s = signal<T | undefined>(state.get());
  const dispose = state.subscribe(() => {
    s.value = state.get();
  });
  return { signal: s, dispose };
}

export function eventSignal<T = unknown>(
  events: EventsApi,
  topic: string,
): { signal: ReadonlySignal<EventMessage<T> | undefined>; dispose(): void } {
  const s = signal<EventMessage<T> | undefined>(undefined);
  const dispose = events.on(topic, (message) => {
    s.value = message as EventMessage<T>;
  });
  return { signal: s, dispose };
}
