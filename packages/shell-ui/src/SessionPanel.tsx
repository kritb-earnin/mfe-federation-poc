import { useSyncExternalStore } from "react";
import type { SessionApi } from "@poc/platform-contracts";
import { FICTIONAL_ACCOUNTS, FICTIONAL_USERS } from "@poc/test-support";

type Props = {
  session: SessionApi;
  busy: boolean;
  error: string | null;
  onLogin: () => void;
  onLogout: () => void;
  onSwitchAccount: (accountId: string) => void;
};

export function SessionPanel({
  session,
  busy,
  error,
  onLogin,
  onLogout,
  onSwitchAccount,
}: Props) {
  const snapshot = useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );
  const userLabel =
    snapshot.subjectId && snapshot.subjectId in FICTIONAL_USERS
      ? FICTIONAL_USERS[snapshot.subjectId as keyof typeof FICTIONAL_USERS].displayName
      : snapshot.subjectId ?? "none";
  const accountLabel =
    snapshot.accountId && snapshot.accountId in FICTIONAL_ACCOUNTS
      ? FICTIONAL_ACCOUNTS[snapshot.accountId as keyof typeof FICTIONAL_ACCOUNTS].name
      : snapshot.accountId ?? "none";

  return (
    <section aria-label="Session controls" style={{ border: "1px solid #cbd5e1", padding: 12, borderRadius: 8 }}>
      <h2>Session (fictional)</h2>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
        <dt>Status</dt>
        <dd data-testid="session-status">{snapshot.status}</dd>
        <dt>User</dt>
        <dd data-testid="session-user">{userLabel}</dd>
        <dt>Account</dt>
        <dd data-testid="session-account">{accountLabel}</dd>
        <dt>Context revision</dt>
        <dd data-testid="session-revision">{snapshot.contextRevision}</dd>
        <dt>Contract version</dt>
        <dd>{session.contractVersion}</dd>
      </dl>
      {error ? (
        <p role="alert" data-testid="session-error">
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <button type="button" data-testid="login" disabled={busy} onClick={onLogin}>
          Login (Ava / North)
        </button>
        <button type="button" data-testid="logout" disabled={busy} onClick={onLogout}>
          Logout
        </button>
        <button
          type="button"
          data-testid="switch-north"
          disabled={busy}
          onClick={() => onSwitchAccount("acct_north")}
        >
          Switch to North
        </button>
        <button
          type="button"
          data-testid="switch-south"
          disabled={busy}
          onClick={() => onSwitchAccount("acct_south")}
        >
          Switch to South
        </button>
      </div>
    </section>
  );
}
