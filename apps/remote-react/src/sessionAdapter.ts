import { useSyncExternalStore } from "react";
import type { SessionApi, SessionSnapshot } from "@poc/platform-contracts";

export function readSessionSnapshot(session: SessionApi): Readonly<SessionSnapshot> {
  return session.getSnapshot();
}

export function useSessionSnapshot(session: SessionApi): Readonly<SessionSnapshot> {
  return useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => readSessionSnapshot(session),
    () => readSessionSnapshot(session),
  );
}
