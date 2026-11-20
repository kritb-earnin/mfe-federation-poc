import React, { type Dispatch, type SetStateAction } from "react";
import type { EventsApi, RemoteBlockReason, SessionApi, ShellApi } from "@poc/platform-contracts";
export type LocalFeatureState = {
    draftNote: string;
};
type AppProps = {
    session: SessionApi;
    shell?: ShellApi;
    blocked: RemoteBlockReason | null;
    localFeature: LocalFeatureState;
    setLocalFeature: Dispatch<SetStateAction<LocalFeatureState>>;
    events?: EventsApi;
    /** Latest `events.ping` n; owned by mount so resetIdentityState can clear it. */
    lastPing?: number | null;
    setLastPing?: (n: number) => void;
};
export declare function App({ session, shell, blocked, localFeature, setLocalFeature, events, lastPing, setLastPing }: AppProps): React.JSX.Element;
/** Header slot content: open-order count from the remote's own query. Nothing while anonymous, `—` while loading. */
export declare function OpenOrdersBadge({ session, shell }: {
    session: SessionApi;
    shell: ShellApi;
}): React.JSX.Element | null;
export {};
