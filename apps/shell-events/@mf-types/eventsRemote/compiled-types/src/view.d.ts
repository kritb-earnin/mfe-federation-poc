import type { MountCapabilities } from "@poc/platform-contracts";
export type EventsView = {
    resetIdentityState(): Promise<void>;
    resume(): void;
    block(message: string): void;
    dispose(): void;
};
export declare function createView(root: HTMLElement, capabilities: MountCapabilities): EventsView;
