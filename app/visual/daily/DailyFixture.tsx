'use client'
import { useEffect, useState } from 'react'
import { runInAction } from 'mobx'
import { MotionConfig } from 'motion/react'
import { RootStore } from '../../stores/RootStore'
import type { Attempt } from '../../challenge/attempt'
import { CorpusSource } from '../../stores/corpusSource'
import { StoreContext } from '../../provider'
import DominoClient from '../../dominoFill/DominoClient'

// Rendered so minification cannot discard the production-exclusion positive control.
export const DAILY_SENTINEL = 'domino-daily-fixture-5c0e7a31'

/**
 * The real game with the Daily Challenge switched on (slice 3a, rule 20), for the browser
 * tests: the public page's own wrapper and `DominoClient`, the real corpus, the real
 * coordinator and storage. Since slice 3b the root is `provider.tsx`'s own; this page adds
 * the hooks below, and `?challenge=off` for the page as it was before.
 *
 * Compiled only into the `DOMINO_VISUAL_SHEET` build, like the rest of `app/visual`.
 */
/**
 * The root, for a browser test that needs a day's other boards already solved: playing eight
 * boards by drag to reach the last would cost more than what is under test. And `seed`, which
 * puts attempts straight into the coordinator's history, for the layout measurement of slice
 * 3b's rule 14: a four-digit streak takes thousands of played days, which no test can play.
 * The history is what the screen reads; storage is not involved.
 */
declare global {
    interface Window { dailyFixture?: { root: RootStore, seed(attempts: Attempt[]): void } }
}

export default function DailyFixture() {
    // `?challenge=off` is the page as it was before the challenge went live (slice 3b, rule
    // 16): the layout suites measure the challenge's rows against it, and the public page
    // has no casual today any more. Read in the browser only; the server render is the same
    // loading state either way.
    const [root] = useState(() => new RootStore(new CorpusSource(), {
        challenge: typeof window === 'undefined'
            || new URLSearchParams(window.location.search).get('challenge') !== 'off',
    }))
    useEffect(() => {
        window.dailyFixture = {
            root,
            seed: attempts => runInAction(() => {
                for (const attempt of attempts) root.challenge!.history.set(attempt.puzzleId, attempt)
            }),
        }
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
