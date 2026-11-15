import { createStore } from "zustand/vanilla";
import {
  SESSION_CONTRACT_VERSION,
  SessionCommandError,
  assertAccountId,
  type RemoteLifecycle,
  type SessionApi,
  type SessionSnapshot,
  type TransitionContext,
} from "@poc/platform-contracts";
import { createRemoteRegistry } from "./remoteRegistry";
import type { RemoteRegistry } from "./types";

export type AuthBridge = {
  login(): Promise<{ subjectId: string; accountId: string }>;
  logout(): Promise<void>;
  changeAccount(accountId: string): Promise<{ subjectId: string; accountId: string }>;
};

export type CoordinatorOptions = {
  auth: AuthBridge;
  transitionTimeoutMs?: number;
};

type InternalState = { snapshot: SessionSnapshot };
type Command = {
  generation: number;
  superseded: Promise<never>;
  rejectSuperseded: (error: Error) => void;
  timeout: Promise<never>;
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function createSessionCoordinator(options: CoordinatorOptions): {
  api: SessionApi;
  registry: RemoteRegistry;
  dispose(): void;
} {
  const timeoutMs = options.transitionTimeoutMs ?? 3000;
  const store = createStore<InternalState>(() => ({
    snapshot: Object.freeze({ status: "initializing", contextRevision: 0 }),
  }));
  let snapshotRef = store.getState().snapshot;
  const listeners = new Set<() => void>();
  const { registry, remotes, blocked } = createRemoteRegistry();
  let generation = 0;
  let currentCommand: Command | undefined;
  let remoteLifecycle: Promise<void> = Promise.resolve();
  let disposed = false;

  const publish = (snapshot: SessionSnapshot) => {
    snapshotRef = Object.freeze({ ...snapshot });
    store.setState({ snapshot: snapshotRef });
    for (const listener of [...listeners]) listener();
  };

  queueMicrotask(() => {
    if (!disposed && snapshotRef.status === "initializing") {
      publish({ status: "anonymous", contextRevision: snapshotRef.contextRevision });
    }
  });

  const checkCurrent = (command: Command) => {
    if (command.generation !== generation) {
      throw new SessionCommandError("TRANSITION_SUPERSEDED", "Superseded by a newer session command");
    }
  };

  const runRemotes = async (
    context: TransitionContext,
    phase: "prepareTransition" | "resetIdentityState",
  ) => {
    const tasks = [...remotes.entries()].filter(([id]) => !blocked.has(id)).map(async ([id, remote]) => {
      try {
        await remote[phase](context);
      } catch (error) {
        if (phase === "resetIdentityState") {
          blocked.add(id);
          remote.block({ type: "cleanup_failed", message: String(error) });
          throw new SessionCommandError("REMOTE_CLEANUP_FAILED", String(error));
        }
        throw error;
      }
    });
    const results = await Promise.allSettled(tasks);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) throw failure.reason;
  };

  const withTransition = async (run: (context: TransitionContext, command: Command) => Promise<SessionSnapshot>) => {
    const { promise: superseded, reject: rejectSuperseded } = createDeferred<never>();
    const { promise: timeout, reject: rejectTimeout } = createDeferred<never>();
    const command: Command = {
      generation: ++generation,
      superseded,
      rejectSuperseded,
      timeout,
    };
    currentCommand?.rejectSuperseded(
      new SessionCommandError("TRANSITION_SUPERSEDED", "Superseded by a newer session command"),
    );
    currentCommand = command;
    const fromRevision = snapshotRef.contextRevision;
    const toRevision = fromRevision + 1;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      rejectTimeout(new SessionCommandError("TRANSITION_TIMEOUT", `Transition timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    publish({ status: "transitioning", contextRevision: toRevision });
    const context: TransitionContext = { fromRevision, toRevision, signal: controller.signal };

    const execute = async () => {
      try {
        const lifecycle = remoteLifecycle.then(async () => {
          checkCurrent(command);
          await runRemotes(context, "prepareTransition");
          checkCurrent(command);
          await runRemotes(context, "resetIdentityState");
          checkCurrent(command);
        });
        remoteLifecycle = lifecycle.catch(() => {});
        await Promise.race([lifecycle, command.superseded, command.timeout]);
        checkCurrent(command);
        const next = await Promise.race([run(context, command), command.superseded, command.timeout]);
        checkCurrent(command);
        publish(next);
        const resume = remoteLifecycle.then(async () => {
          checkCurrent(command);
          for (const [id, remote] of remotes) {
            checkCurrent(command);
            if (!blocked.has(id)) await remote.resume(context);
          }
        });
        remoteLifecycle = resume.catch(() => {});
        await Promise.race([resume, command.superseded, command.timeout]);
      } catch (error) {
        if (error instanceof SessionCommandError && error.code === "TRANSITION_SUPERSEDED") throw error;
        if (error instanceof SessionCommandError && error.code === "TRANSITION_TIMEOUT") {
          for (const [id, remote] of remotes) {
            if (!blocked.has(id)) {
              blocked.add(id);
              remote.block({ type: "timeout", message: `Transition exceeded ${timeoutMs}ms` });
            }
          }
        }
        if (command.generation === generation) {
          publish({ status: "error", contextRevision: toRevision });
        }
        throw error instanceof SessionCommandError
          ? error
          : new SessionCommandError("TRANSITION_FAILED", String(error));
      } finally {
        clearTimeout(timer);
        if (currentCommand === command) currentCommand = undefined;
      }
    };
    return Promise.race([execute(), command.superseded]);
  };

  const api: SessionApi = {
    contractVersion: SESSION_CONTRACT_VERSION,
    getSnapshot: () => snapshotRef,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    requestLogin: () => withTransition(async (_context, command) => {
      const identity = await Promise.race([options.auth.login(), command.superseded]);
      checkCurrent(command);
      return { status: "authenticated", ...identity, contextRevision: snapshotRef.contextRevision };
    }),
    requestLogout: () => withTransition(async (_context, command) => {
      await Promise.race([options.auth.logout(), command.superseded]);
      checkCurrent(command);
      return { status: "anonymous", contextRevision: snapshotRef.contextRevision };
    }),
    requestAccountChange: (accountId) => withTransition(async (_context, command) => {
      const validAccountId = assertAccountId(accountId);
      const identity = await Promise.race([options.auth.changeAccount(validAccountId), command.superseded]);
      checkCurrent(command);
      return { status: "authenticated", ...identity, contextRevision: snapshotRef.contextRevision };
    }),
  };

  // The registry owns the maps so blocked remotes remain isolated to this coordinator.

  return {
    api,
    registry,
    dispose() {
      if (disposed) return;
      disposed = true;
      currentCommand?.rejectSuperseded(new SessionCommandError("TRANSITION_SUPERSEDED", "Coordinator disposed"));
      listeners.clear();
      for (const remote of remotes.values()) remote.dispose();
      remotes.clear();
      blocked.clear();
    },
  };
}
