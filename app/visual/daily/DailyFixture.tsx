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
 * coordinator and storage. Only the root's `challenge` option differs from `provider.tsx`,
 * which stays switched off until slice 3b.
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
    const [root] = useState(() => new RootStore(new CorpusSource(), { challenge: true }))
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
