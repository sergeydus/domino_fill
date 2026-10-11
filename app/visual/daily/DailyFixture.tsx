'use client'
import { useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { RootStore } from '../../stores/RootStore'
import { CorpusSource } from '../../stores/corpusSource'
import { StoreContext } from '../../provider'
import DominoClient from '../../dominoFill/DominoClient'

// Rendered so minification cannot discard the production-exclusion positive control.
export const DAILY_SENTINEL = 'domino-daily-fixture-5c0e7a31'

/**
 * The real game with the Daily Challenge switched on (slice 3a, rule 20), for the browser
 * tests: the public page's own wrapper and `DominoClient`, the real corpus, the real
 * coordinator and storage. Only the root's `challenge` option differs from `provider.tsx`,
 * which stays switched off until slice 3b.
 *
 * Compiled only into the `DOMINO_VISUAL_SHEET` build, like the rest of `app/visual`.
 */
/**
 * The root, for a browser test that needs a day's other boards already solved: playing eight
 * boards by drag to reach the last would cost more than what is under test.
 */
declare global {
    interface Window { dailyFixture?: { root: RootStore } }
}

export default function DailyFixture() {
    const [root] = useState(() => new RootStore(new CorpusSource(), { challenge: true }))
    useEffect(() => {
        window.dailyFixture = { root }
        void root.start()
        return () => {
            root.dispose()
            delete window.dailyFixture
        }
    }, [root])
    return (
        <MotionConfig reducedMotion="user">
            <StoreContext.Provider value={root}>
                <div data-daily-fixture={DAILY_SENTINEL} className="flex flex-col min-h-svh bg-ground">
                    <DominoClient />
                </div>
            </StoreContext.Provider>
        </MotionConfig>
    )
}
