import { effect, signal } from "@preact/signals-core";
import { eventSignal, topicSignal } from "@poc/events-signals";
import type { EventsApi, MountCapabilities, ShellUser } from "@poc/platform-contracts";
import { buttonVariants, cardClass, cardContentClass, cardHeaderClass, cardTitleClass } from "@poc/design-system/variants";

const DASH = "—";

/** Match by name+code, not instanceof: platform-contracts is not shared through Module Federation. */
function isRevoked(error: unknown): boolean {
  const e = error as { name?: string; code?: string } | null;
  return e?.name === "EventsCommandError" && e.code === "FACADE_REVOKED";
}

function tolerate(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (!isRevoked(error)) throw error;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, testId?: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (testId) node.setAttribute("data-testid", testId);
  if (text !== undefined) node.textContent = text;
  return node;
}

export type EventsView = {
  resetIdentityState(): Promise<void>;
  resume(): void;
  block(message: string): void;
  dispose(): void;
};

export function createView(root: HTMLElement, capabilities: MountCapabilities): EventsView {
  const events: EventsApi | undefined = capabilities.events;
  const card = el("section", `${cardClass} flex flex-col gap-3 p-4`, "events-root");
  const header = el("div", cardHeaderClass);
  header.append(el("h2", cardTitleClass, "events-heading", "Events (vanilla signals)"));
  const content = el("div", `${cardContentClass} flex flex-col gap-2`);
  card.append(header, content);
  root.append(card);

  if (!events) {
    content.append(el("p", "m-0 text-muted-foreground", "events-unavailable", "events unavailable"));
    return {
      resetIdentityState: async () => {
        if (capabilities.forceCleanupFail) throw new Error("forced cleanup failure");
      },
      resume() {},
      block(message) {
        content.replaceChildren(el("p", "m-0 text-destructive", "events-blocked", message));
      },
      dispose() {
        card.remove();
      },
    };
  }

  const row = (label: string, testId: string) => {
    const line = el("p", "m-0 flex gap-2 text-sm");
    const value = el("span", "font-medium", testId, DASH);
    line.append(el("span", "text-muted-foreground", undefined, label), value);
    content.append(line);
    return value;
  };
  const pathEl = row("path", "events-shell-path");
  const langEl = row("language", "events-shell-language");
  const userEl = row("user", "events-shell-user");
  const noticeEl = row("notice", "events-last-notice");
  const counterEl = row("counter", "events-counter");
  counterEl.classList.add("proportional-nums");
  const ackEl = row("ack", "events-last-ack");
  const ping = el("button", buttonVariants({ size: "sm" }), "events-ping", "Ping");
  ping.type = "button";
  content.append(ping);

  // Signals created against a revoked facade may throw; fall back to a dead signal so the page never crashes.
  const dead = { signal: signal<undefined>(undefined), dispose() {} };
  const safe = <S>(make: () => S | typeof dead): S | typeof dead => {
    try {
      return make();
    } catch (error) {
      if (!isRevoked(error)) throw error;
      return dead;
    }
  };
  const path = safe(() => topicSignal<string>(events, "shell.path"));
  const language = safe(() => topicSignal<string>(events, "shell.language"));
  const user = safe(() => topicSignal<ShellUser | null>(events, "shell.user"));
  const notice = safe(() => eventSignal<{ text?: string }>(events, "shell.notice"));
  const ack = safe(() => eventSignal<unknown>(events, "react.ack"));
  const all = [path, language, user, notice, ack];

  const counter = signal(0);
  // Messages seen before a reset are hidden; eventSignals cannot be cleared from outside.
  const noticeBase = signal<unknown>(notice.signal.value);
  const ackBase = signal<unknown>(ack.signal.value);
  let n = 0;
  let disposed = false;

  const stop = effect(() => {
    pathEl.textContent = (path.signal.value as string | undefined) ?? DASH;
    langEl.textContent = (language.signal.value as string | undefined) ?? DASH;
    userEl.textContent = (user.signal.value as ShellUser | null | undefined)?.displayName ?? DASH;
    const nm = notice.signal.value as { payload?: { text?: string } } | undefined;
    noticeEl.textContent = nm && nm !== noticeBase.value ? (nm.payload?.text ?? DASH) : DASH;
    const am = ack.signal.value as { payload?: unknown } | undefined;
    ackEl.textContent = am && am !== ackBase.value ? JSON.stringify(am.payload) : DASH;
    counterEl.textContent = String(counter.value);
  });

  ping.addEventListener("click", () => {
    n += 1;
    counter.value = n;
    tolerate(() => {
      events.publish("events.ping", { n });
      events.setState("events.counter", n);
    });
  });

  return {
    async resetIdentityState() {
      if (capabilities.forceCleanupFail) throw new Error("forced cleanup failure");
      n = 0;
      counter.value = 0;
      noticeBase.value = notice.signal.value;
      ackBase.value = ack.signal.value;
    },
    resume() {
      if (n > 0) tolerate(() => events.setState("events.counter", n));
    },
    block(message) {
      stop();
      all.forEach((s) => s.dispose());
      content.replaceChildren(el("p", "m-0 text-destructive", "events-blocked", message));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      all.forEach((s) => s.dispose());
      card.remove();
    },
  };
}
