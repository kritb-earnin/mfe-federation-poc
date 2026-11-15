import { createApp, h, shallowRef } from "vue";
import type { MountCapabilities, MountHandle, RemoteBlockReason, RemoteMount, SessionApi } from "@poc/platform-contracts";
import { createApolloClient } from "./apollo.js";
import App from "./App.vue";

function resolveSession(capabilities: MountCapabilities): SessionApi {
  const session = capabilities.session ?? capabilities.resolveSession?.();
  if (!session) throw new Error("Vue remote requires a session capability or resolver");
  return session;
}

export const mount: RemoteMount = (element, capabilities): MountHandle => {
  const session = resolveSession(capabilities);
  const snapshot = () => session.getSnapshot();
  const makeClient = () => createApolloClient(() => {
    const current = snapshot();
    return {
      "x-poc-session": current.subjectId ?? "",
      "x-poc-account": current.accountId ?? "",
    };
  });
  let client = makeClient();
  const blocked = shallowRef<RemoteBlockReason | null>(null);
  let disposed = false;
  const app = createApp({
    setup: () => () => h(App, { session, client, blocked: blocked.value }),
  });
  app.mount(element);

  const lifecycle = {
    async prepareTransition(ctx: { signal: AbortSignal }): Promise<void> {
      ctx.signal.throwIfAborted();
      await client.stop();
    },
    async resetIdentityState(ctx: { signal: AbortSignal }): Promise<void> {
      ctx.signal.throwIfAborted();
      if (capabilities.forceCleanupFail) throw new Error("forced cleanup failure");
      const oldClient = client;
      client = makeClient();
      await oldClient.stop();
    },
    async resume(ctx: { signal: AbortSignal }): Promise<void> {
      ctx.signal.throwIfAborted();
      blocked.value = null;
    },
    block(reason: RemoteBlockReason): void {
      blocked.value = reason;
      void client.stop();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      void client.stop();
      app.unmount();
    },
  };
  return { lifecycle, unmount: () => lifecycle.dispose() };
};

export default mount;
