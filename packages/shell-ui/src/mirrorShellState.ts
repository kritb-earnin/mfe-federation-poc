import type { ShellRuntime } from "@poc/shell-state";
import type { EventBroker } from "@poc/event-broker";

/** Mirrors the shell's path, language and user into retained `shell.*` topics. Returns cleanup. */
export function mirrorShellState(runtime: ShellRuntime, events: EventBroker): () => void {
  const last = new Map<string, string>();
  const sync = () => {
    const { path, language, user } = runtime.getState();
    for (const [topic, value] of [["shell.path", path], ["shell.language", language], ["shell.user", user]] as const) {
      const json = JSON.stringify(value);
      if (last.get(topic) === json) continue;
      last.set(topic, json);
      events.setShellState(topic, value);
    }
  };
  sync();
  return runtime.subscribe(sync);
}
