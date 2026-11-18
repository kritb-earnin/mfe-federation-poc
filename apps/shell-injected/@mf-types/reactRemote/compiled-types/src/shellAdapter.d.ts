import type { ShellApi, ShellState } from "@poc/platform-contracts";
/** Shell state via useSyncExternalStore; null when the shell capability is absent. */
export declare function useShellState(shell: ShellApi | undefined): Readonly<ShellState> | null;
/**
 * Runs a shell command, ignoring only the expected refusals: FACADE_REVOKED (remote was blocked or
 * unmounted) and SLOT_TAKEN (another remote holds the slot). Anything else, INVALID_* included, is a bug and rethrows.
 */
export declare function tryShell<T>(command: () => T): T | undefined;
/** `/orders/<id>` -> id, otherwise null. */
export declare function orderIdFromPath(path: string | undefined): string | null;
/** Mirrors the contract's 40-character label limit (validateLayoutSpec); truncates with an ellipsis. */
export declare function clampLabel(label: string, max?: number): string;
