/**
 * Runs an events command, ignoring only FACADE_REVOKED (remote was blocked or unmounted).
 * Anything else is a bug and rethrows.
 *
 * Matches by name + code, not `instanceof`: @poc/platform-contracts is not in the federation shared scope,
 * so the shell's EventsCommandError class is a different copy from the one bundled in this remote.
 */
export function tryEvents<T>(command: () => T): T | undefined {
  try {
    return command();
  } catch (error) {
    const e = error as { name?: unknown; code?: unknown } | null;
    if (e?.name === "EventsCommandError" && e.code === "FACADE_REVOKED") return undefined;
    throw error;
  }
}
