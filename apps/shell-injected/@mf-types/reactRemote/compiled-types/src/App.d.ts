import React, { type Dispatch, type SetStateAction } from "react";
import type { RemoteBlockReason, SessionApi } from "@poc/platform-contracts";
export type LocalFeatureState = {
    draftNote: string;
};
type AppProps = {
    session: SessionApi;
    blocked: RemoteBlockReason | null;
    localFeature: LocalFeatureState;
    setLocalFeature: Dispatch<SetStateAction<LocalFeatureState>>;
};
export declare function App({ session, blocked, localFeature, setLocalFeature }: AppProps): React.JSX.Element;
export {};
