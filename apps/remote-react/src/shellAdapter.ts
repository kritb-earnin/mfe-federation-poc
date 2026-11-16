import { useSyncExternalStore } from "react";
import type { ShellApi, ShellState } from "@poc/platform-contracts";

const noop = () => () => {};
const none = () => null;

/** Shell state via useSyncExternalStore; null when the shell capability is absent. */
export function useShellState(shell: ShellApi | undefined): Readonly<ShellState> | null {
  return useSyncExternalStore(
    shell ? (onChange) => shell.subscribe(onChange) : noop,
    shell ? () => shell.getState() : none,
    shell ? () => shell.getState() : none,
  );
}

/** Runs a shell command; a revoked facade (after block or unmount) or rejected command is ignored. */
export function tryShell<T>(command: () => T): T | undefined {
  try {
    return command();
  } catch {
    return undefined;
  }
}

/** `/orders/<id>` -> id, otherwise null. */
export function orderIdFromPath(path: string | undefined): string | null {
  return path?.match(/^\/orders\/([^/]+)$/)?.[1] ?? null;
}
