"use client"
import { createContext, useState } from "react";
import { MotionConfig } from "motion/react";
import { RootStore } from "@/app/stores/RootStore";

// `null` default rather than a fallback singleton: a fallback would silently hand out a
// store shared across the server process, which is the bug this boundary exists to prevent.
// `useStores` throws instead, so a missing provider fails loudly at the first read.
export const StoreContext = createContext<RootStore | null>(null);

export const StoreWrapper = ({ children }: { children: React.ReactNode }) => {
    // Lazy initialiser: constructed once per mount, never on re-render.
    const [store] = useState(() => new RootStore());

    /*
     * `reducedMotion="user"` covers every animation in the app at once (spec P1-8, row 19).
     *
     * Nothing here honoured `prefers-reduced-motion` before -- measured by searching the
     * whole tree for it and finding no reference in any component or stylesheet -- while
     * the game animates a great deal: the board shakes on a refused move, the level arrows
     * scale on hover, the difficulty buttons and every line label tween their colour, and
     * the completion card animates in. For someone with a vestibular disorder that is the
     * difference between a puzzle and a reason to close the tab.
     *
     * At the provider rather than in the page, because it has to wrap every `motion`
     * component in the tree and this is the one client boundary they all sit inside. Under
     * `"user"`, transform and layout animations are dropped when the OS setting is on;
     * opacity and colour still cross-fade, which is what the setting actually asks for.
     */
    return (
        <MotionConfig reducedMotion="user">
            <StoreContext.Provider value={store}>
                {children}
            </StoreContext.Provider>
        </MotionConfig>
    );
};
