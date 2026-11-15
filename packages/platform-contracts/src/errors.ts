export type SessionErrorCode =
  | "INVALID_ACCOUNT"
  | "TRANSITION_SUPERSEDED"
  | "TRANSITION_TIMEOUT"
  | "TRANSITION_FAILED"
  | "REMOTE_CLEANUP_FAILED";

export class SessionCommandError extends Error {
  readonly code: SessionErrorCode;
  constructor(code: SessionErrorCode, message: string) {
    super(message);
    this.name = "SessionCommandError";
    this.code = code;
  }
}
