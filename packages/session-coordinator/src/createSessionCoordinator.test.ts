import { describe, expect, it, vi } from "vitest";
import type { RemoteLifecycle, TransitionContext } from "@poc/platform-contracts";
import { createSessionCoordinator } from "./createSessionCoordinator";

function fakeRemote(overrides: Partial<RemoteLifecycle> = {}): RemoteLifecycle {
  return {
    prepareTransition: vi.fn(async () => {}),
    resetIdentityState: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    block: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

const auth = {
  login: async () => ({ subjectId: "user_ava", accountId: "acct_north" }),
  logout: async () => {},
  changeAccount: async (accountId: string) => ({ subjectId: "user_ava", accountId }),
};

describe("createSessionCoordinator", () => {
  it("keeps snapshot reference stable until change", async () => {
    const c = createSessionCoordinator({ auth });
    const a = c.api.getSnapshot();
    expect(c.api.getSnapshot()).toBe(a);
    await c.api.requestLogin();
    const next = c.api.getSnapshot();
    expect(next).not.toBe(a);
    expect(c.api.getSnapshot()).toBe(next);
    c.dispose();
  });

  it("supports subscribe and unsubscribe", async () => {
    const c = createSessionCoordinator({ auth });
    await Promise.resolve();
    const listener = vi.fn();
    const unsubscribe = c.api.subscribe(listener);
    await c.api.requestLogin();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await c.api.requestLogout();
    expect(listener).toHaveBeenCalledTimes(2);
    c.dispose();
  });

  it("creates an independent coordinator instance per call", async () => {
    const first = createSessionCoordinator({ auth });
    const second = createSessionCoordinator({ auth });
    const remote = fakeRemote();
    first.registry.register("remote", remote);
    await first.api.requestLogin();
    expect(first.api.getSnapshot().status).toBe("authenticated");
    expect(second.api.getSnapshot().status).toBe("anonymous");
    expect(remote.prepareTransition).toHaveBeenCalledTimes(1);
    expect(second.registry).not.toBe(first.registry);
    first.dispose();
    second.dispose();
  });

  it("bumps revision before resuming remotes and follows transition statuses", async () => {
    const c = createSessionCoordinator({ auth });
    await Promise.resolve();
    const statuses = [c.api.getSnapshot().status];
    c.api.subscribe(() => statuses.push(c.api.getSnapshot().status));
    const remote = fakeRemote({
      resume: vi.fn(async (ctx: TransitionContext) => {
        expect(c.api.getSnapshot().contextRevision).toBe(ctx.toRevision);
        expect(c.api.getSnapshot().status).toBe("authenticated");
      }),
    });
    c.registry.register("remote", remote);
    await c.api.requestLogin();
    expect(statuses).toEqual(["anonymous", "transitioning", "authenticated"]);
    expect(c.api.getSnapshot()).toMatchObject({
      status: "authenticated",
      subjectId: "user_ava",
      accountId: "acct_north",
      contextRevision: 1,
    });
    expect(remote.resume).toHaveBeenCalledTimes(1);
    c.dispose();
  });

  it("serializes remote work after a superseded slow prepare", async () => {
    let prepareCalls = 0;
    let finishPrepare!: () => void;
    let prepareStarted!: () => void;
    const started = new Promise<void>((resolve) => { prepareStarted = resolve; });
    const remote = fakeRemote({
      prepareTransition: vi.fn(async () => {
        prepareCalls += 1;
        if (prepareCalls === 1) {
          prepareStarted();
          await new Promise<void>((resolve) => { finishPrepare = resolve; });
        }
      }),
    });
    const c = createSessionCoordinator({ auth });
    c.registry.register("remote", remote);
    const first = c.api.requestLogin();
    await started;
    const second = c.api.requestAccountChange("acct_south");
    await expect(first).rejects.toMatchObject({ code: "TRANSITION_SUPERSEDED" });
    expect(remote.prepareTransition).toHaveBeenCalledTimes(1);
    finishPrepare();
    await second;
    expect(remote.prepareTransition).toHaveBeenCalledTimes(2);
    expect(remote.resetIdentityState).toHaveBeenCalledTimes(1);
    expect(c.api.getSnapshot()).toMatchObject({ status: "authenticated", accountId: "acct_south" });
    c.dispose();
  });

  it("times out a hanging auth bridge without publishing late success", async () => {
    let finishLogin!: (identity: { subjectId: string; accountId: string }) => void;
    const login = new Promise<{ subjectId: string; accountId: string }>((resolve) => { finishLogin = resolve; });
    const c = createSessionCoordinator({
      auth: { ...auth, login: vi.fn(() => login) },
      transitionTimeoutMs: 5,
    });
    await expect(c.api.requestLogin()).rejects.toMatchObject({ code: "TRANSITION_TIMEOUT" });
    finishLogin({ subjectId: "user_ava", accountId: "acct_north" });
    await Promise.resolve();
    expect(c.api.getSnapshot()).toMatchObject({ status: "error", contextRevision: 1 });
    c.dispose();
  });

  it("blocks a remote when reset times out and never resumes it", async () => {
    const remote = fakeRemote({ resetIdentityState: vi.fn(() => new Promise<void>(() => {})) });
    const c = createSessionCoordinator({ auth, transitionTimeoutMs: 5 });
    c.registry.register("stuck-cleanup", remote);
    await expect(c.api.requestLogin()).rejects.toMatchObject({ code: "TRANSITION_TIMEOUT" });
    expect(remote.block).toHaveBeenCalledWith(expect.objectContaining({ type: "timeout" }));
    expect(remote.resume).not.toHaveBeenCalled();
    expect(c.api.getSnapshot()).toMatchObject({ status: "error" });
    c.dispose();
  });

  it("times out a remote prepare, blocks it, and fails the transition closed", async () => {
    const remote = fakeRemote({ prepareTransition: vi.fn(() => new Promise<void>(() => {})) });
    const c = createSessionCoordinator({ auth, transitionTimeoutMs: 5 });
    c.registry.register("stuck", remote);
    await expect(c.api.requestLogin()).rejects.toMatchObject({ code: "TRANSITION_TIMEOUT" });
    expect(remote.block).toHaveBeenCalledWith(expect.objectContaining({ type: "timeout" }));
    expect(c.api.getSnapshot()).toMatchObject({ status: "error", contextRevision: 1 });
    expect(remote.resume).not.toHaveBeenCalled();
    c.dispose();
  });

  it("lets a remote reject obsolete revision work", async () => {
    const c = createSessionCoordinator({ auth });
    let currentRevision = 0;
    const staleWork = vi.fn();
    const remote = fakeRemote({
      resume: vi.fn(async (ctx) => {
        currentRevision = ctx.toRevision;
        if (ctx.toRevision !== c.api.getSnapshot().contextRevision) staleWork();
      }),
    });
    c.registry.register("revision-aware", remote);
    await c.api.requestLogin();
    const obsolete: TransitionContext = {
      fromRevision: 0,
      toRevision: 0,
      signal: new AbortController().signal,
    };
    if (obsolete.toRevision === currentRevision) staleWork();
    expect(currentRevision).toBe(1);
    expect(staleWork).not.toHaveBeenCalled();
    c.dispose();
  });

  it("blocks a remote after cleanup failure and never resumes it", async () => {
    const remote = fakeRemote({ resetIdentityState: vi.fn(async () => { throw new Error("cleanup failed"); }) });
    const c = createSessionCoordinator({ auth });
    c.registry.register("dirty", remote);
    await expect(c.api.requestLogin()).rejects.toMatchObject({ code: "REMOTE_CLEANUP_FAILED" });
    expect(remote.block).toHaveBeenCalledWith(expect.objectContaining({ type: "cleanup_failed" }));
    expect(remote.resume).not.toHaveBeenCalled();
    expect(c.api.getSnapshot()).toMatchObject({ status: "error", contextRevision: 1 });
    c.dispose();
  });
});
