"use client"
import { createContext, useState } from "react";
import { RootStore } from "@/app/stores/RootStore";

// `null` default rather than a fallback singleton: a fallback would silently hand out a
// store shared across the server process, which is the bug this boundary exists to prevent.
// `useStores` throws instead, so a missing provider fails loudly at the first read.
export const StoreContext = createContext<RootStore | null>(null);

export const StoreWrapper = ({ children }: { children: React.ReactNode }) => {
    // Lazy initialiser: constructed once per mount, never on re-render.
    const [store] = useState(() => new RootStore());

    return (
        <StoreContext.Provider value={store}>
            {children}
        </StoreContext.Provider>
    );
};
