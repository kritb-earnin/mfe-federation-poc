import type { SessionApi, SessionSnapshot } from "@poc/platform-contracts";
export declare function readSessionSnapshot(session: SessionApi): Readonly<SessionSnapshot>;
export declare function useSessionSnapshot(session: SessionApi): Readonly<SessionSnapshot>;
