export const SESSION_CONTRACT_VERSION = 1 as const;

export type SessionStatus =
  | "initializing"
  | "authenticated"
  | "anonymous"
  | "transitioning"
  | "error";

export type SessionSnapshot = {
  status: SessionStatus;
  subjectId?: string;
  accountId?: string;
  contextRevision: number;
};

export interface SessionApi {
  readonly contractVersion: typeof SESSION_CONTRACT_VERSION;
  getSnapshot(): Readonly<SessionSnapshot>;
  subscribe(onChange: () => void): () => void;
  requestLogin(): Promise<void>;
  requestLogout(): Promise<void>;
  requestAccountChange(accountId: string): Promise<void>;
}
