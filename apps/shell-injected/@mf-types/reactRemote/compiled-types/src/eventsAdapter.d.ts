/**
 * Runs an events command, ignoring only FACADE_REVOKED (remote was blocked or unmounted).
 * Anything else is a bug and rethrows.
 *
 * Matches by name + code, not `instanceof`: @poc/platform-contracts is not in the federation shared scope,
 * so the shell's EventsCommandError class is a different copy from the one bundled in this remote.
 */
export declare function tryEvents<T>(command: () => T): T | undefined;
