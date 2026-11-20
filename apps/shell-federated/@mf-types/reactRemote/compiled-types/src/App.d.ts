import React, { type Dispatch, type SetStateAction } from "react";
import type { RemoteBlockReason, SessionApi, ShellApi } from "@poc/platform-contracts";
export type LocalFeatureState = {
    draftNote: string;
};
type AppProps = {
    session: SessionApi;
    shell?: ShellApi;
    blocked: RemoteBlockReason | null;
    localFeature: LocalFeatureState;
    setLocalFeature: Dispatch<SetStateAction<LocalFeatureState>>;
};
export declare function App({ session, shell, blocked, localFeature, setLocalFeature }: AppProps): React.JSX.Element;
/** Header slot content: open-order count from the remote's own query. Nothing while anonymous, `—` while loading. */
export declare function OpenOrdersBadge({ session, shell }: {
    session: SessionApi;
    shell: ShellApi;
}): React.JSX.Element | null;
export {};
