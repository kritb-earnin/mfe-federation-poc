import { createApp, h, shallowRef } from "vue";
import type { MountCapabilities, MountHandle, RemoteBlockReason, RemoteMount, SessionApi } from "@poc/platform-contracts";
import { createApolloClient } from "./apollo.js";
import App from "./App.vue";

function resolveSession(capabilities: MountCapabilities): SessionApi {
  const session = capabilities.session ?? capabilities.resolveSession?.();
  if (!session) throw new Error("Vue remote requires a session capability or resolver");
  return session;
}

function stopClient(client: { stop?: () => void }): void {
  // Apollo stop() can leave observers hanging; never block transitions on it.
  try {
    client.stop?.();
  } catch {
    // ignore
  }
}

export const mount: RemoteMount = (element, capabilities): MountHandle => {
  const session = resolveSession(capabilities);
  const snapshot = () => session.getSnapshot();
  const makeClient = () =>
    createApolloClient(() => {
      const current = snapshot();
      return {
        "x-poc-session": current.subjectId ?? "",
        "x-poc-account": current.accountId ?? "",
      };
    });
  const client = shallowRef(makeClient());
  const blocked = shallowRef<RemoteBlockReason | null>(null);
  const draftNote = shallowRef("");
  let disposed = false;
  const app = createApp({
    setup: () => () =>
      h(App, {
        session,
        client: client.value,
        blocked: blocked.value,
        draftNote: draftNote.value,
        "onUpdate:draftNote": (value: string) => {
          draftNote.value = value;
        },
      }),
  });
  app.mount(element);

  const lifecycle = {
    async prepareTransition(ctx: { signal: AbortSignal }): Promise<void> {
      ctx.signal.throwIfAborted();
      stopClient(client.value);
    },
    async resetIdentityState(ctx: { signal: AbortSignal }): Promise<void> {
      ctx.signal.throwIfAborted();
      if (capabilities.forceCleanupFail) throw new Error("forced cleanup failure");
      const oldClient = client.value;
      draftNote.value = "";
      client.value = makeClient();
      stopClient(oldClient);
    },
    async resume(ctx: { signal: AbortSignal }): Promise<void> {
      ctx.signal.throwIfAborted();
      blocked.value = null;
    },
    block(reason: RemoteBlockReason): void {
      blocked.value = reason;
      draftNote.value = "";
      stopClient(client.value);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stopClient(client.value);
      app.unmount();
    },
  };
  return { lifecycle, unmount: () => lifecycle.dispose() };
};

export default mount;
