import type { Language } from "@poc/platform-contracts";
declare const en: {
    heading: string;
    "Open orders": string;
    Language: string;
    Account: string;
    "Account summary": string;
    Summary: string;
    "Shell user": string;
};
export declare function t(language: Language, key: keyof typeof en): string;
export {};
