import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { EventsApi, TopicState } from "@poc/platform-contracts";

const noopUnsubscribe = () => {};

// Match by name + code, not instanceof: platform-contracts is not shared through Module Federation.
function isRevoked(error: unknown): boolean {
  const e = error as { name?: string; code?: string } | null;
  return e?.name === "EventsCommandError" && e.code === "FACADE_REVOKED";
}

// The facade can be revoked after memoizing; treat that as "no state" instead of throwing during render.
function safe<R>(fn: () => R, fallback: R): R {
  try {
    return fn();
  } catch (error) {
    if (isRevoked(error)) return fallback;
    throw error;
  }
}

export function useTopic<T>(events: EventsApi | undefined, topic: string): T | undefined {
  // broker.state() allocates per call, so memoize; a revoked facade means no state
  const state = useMemo<TopicState<T> | undefined>(() => {
    try {
      return events?.state<T>(topic);
    } catch (error) {
      if (isRevoked(error)) return undefined;
      throw error;
    }
  }, [events, topic]);
  const subscribe = useCallback(
    (onChange: () => void) => safe(() => state?.subscribe(onChange) ?? noopUnsubscribe, noopUnsubscribe),
    [state],
  );
  const get = () => safe(() => state?.get(), undefined);
  return useSyncExternalStore(subscribe, get, get);
}
