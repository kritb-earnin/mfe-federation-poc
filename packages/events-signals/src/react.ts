import { useCallback, useSyncExternalStore } from "react";
import type { EventsApi } from "@poc/platform-contracts";

const noopUnsubscribe = () => {};

export function useTopic<T>(events: EventsApi | undefined, topic: string): T | undefined {
  // events.state() is called per use: the facade is stable per remote and TopicState is cheap
  const state = events?.state<T>(topic);
  const subscribe = useCallback(
    (onChange: () => void) => state?.subscribe(onChange) ?? noopUnsubscribe,
    [state],
  );
  return useSyncExternalStore(subscribe, () => state?.get(), () => state?.get());
}
