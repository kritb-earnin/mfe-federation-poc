import type { ShellApi } from "@poc/platform-contracts";
/** Shell state as a readonly shallowRef; null when the shell capability is absent. One subscription per scope. */
export declare function useShellState(shell: ShellApi | undefined): Readonly<import("vue").Ref<{
    readonly path: string;
    readonly language: import("@poc/platform-contracts").Language;
    readonly user: {
        readonly subjectId: string;
        readonly displayName: string;
    } | null;
} | null, {
    readonly path: string;
    readonly language: import("@poc/platform-contracts").Language;
    readonly user: {
        readonly subjectId: string;
        readonly displayName: string;
    } | null;
} | null>>;
/**
 * Runs a shell command, ignoring only the expected refusals: FACADE_REVOKED (remote was blocked or
 * unmounted) and SLOT_TAKEN (another remote holds the slot). Anything else, INVALID_* included, is a bug and rethrows.
 */
export declare function tryShell<T>(command: () => T): T | undefined;
