'use client'
import { useEffect, useState } from 'react'
import { observer } from 'mobx-react'
import { MotionConfig } from 'motion/react'
import { RootStore } from '../../stores/RootStore'
import { CorpusSource, type LoadedDay } from '../../stores/corpusSource'
import type { DayEntry } from '../../stores/corpus'
import { dayKey } from '../../stores/progressStorage'
import { StoreContext } from '../../provider'
import ClientBoard from '../../dominoFill/ClientBoard'
import GameControls from '../../dominoFill/GameControls'
import AdviceStrip from '../../dominoFill/AdviceStrip'
import { control } from '../../controls'

// Rendered so minification cannot discard the production-exclusion positive control.
export const CHALLENGE_SENTINEL = 'domino-challenge-fixture-9248b6e1'

const day = (date: string): DayEntry => {
    const boards = (size: string) => Array.from({ length: 3 }, (_, index) => ({
        puzzleId: `${date}|challenge-fixture-${size}${index + 1}`,
        board: [[null, null], [null, null]],
        boardHorizontalNumbers: '1,1', boardVerticalNumbers: '2,0',
    }))
    return { date, easyBoards: boards('e'), mediumBoards: boards('m'), hardBoards: boards('h') }
}

/** Deterministic definitions; all attempt, session and persistence code remains real. */
class FixtureCorpus extends CorpusSource {
    override async loadDay(date: string): Promise<LoadedDay> {
        return { day: day(date), requested: date, clamped: null }
    }
}

export type ChallengeFixtureApi = {
    root: RootStore
    stop(): void
}
declare global {
    interface Window { challengeFixture?: ChallengeFixtureApi }
}

const View = observer(({ root }: { root: RootStore }) => {
    const session = root.boardsStore.currentBoard
    if (!session) return <p>Loading challenge fixture</p>
    const binding = session.challengeBinding!
    const coordinator = root.challenge!
    const state = {
        status: coordinator.status, ready: binding.ready,
        covered: coordinator.isCovered(binding), canStart: coordinator.canStart(binding),
        canMutate: coordinator.canMutate(binding), starting: binding.starting,
        assisting: binding.assisting, error: binding.error, puzzleId: binding.puzzleId,
        attempt: binding.attempt, pendingFinish: binding.pendingFinish,
        practice: binding.practice, finished: binding.finished,
        board: session.board, advice: session.advice,
    }
    return <main className='mx-auto flex max-w-md flex-col items-center gap-3 p-3'>
        <h1>{CHALLENGE_SENTINEL}</h1>
        <button className={control('secondary')} onClick={() => { void root.start() }}>Initialize</button>
        <button className={control('secondary')} onClick={() => { void coordinator.retry() }}>Retry saves</button>
        <button className={control('quiet')} onClick={() => root.boardsStore.setLevel(1)}>Board one</button>
        <button className={control('primary')} onClick={() => { void session.startChallenge() }}>Start fixture</button>
        <p data-cover-model>{state.covered ? 'Covered' : 'Revealed'}</p>
        <ClientBoard boardsStore={session} />
        <GameControls boardsStore={session} />
        <AdviceStrip boardsStore={session} />
        <output data-challenge-state className='w-full break-all text-meta'>
            {JSON.stringify(state)}
        </output>
    </main>
})

export default function ChallengeFixture() {
    const [root] = useState(() => new RootStore(new FixtureCorpus(), { challenge: true }))
    useEffect(() => {
        const owned = root
        const stop = () => {
            owned.dispose()
            owned.boardsStore.disposePersist?.()
        }
        owned.boardsStore.setDay(day(dayKey(new Date())))
        for (const session of owned.boardsStore.sessions.values()) {
            session.setAvailableBox({ width: 240, height: 240 })
        }
        owned.boardsStore.beginPersisting()
        window.challengeFixture = { root: owned, stop }
        if (!new URLSearchParams(location.search).has('paused')) void owned.start()
        return () => {
            stop()
            delete window.challengeFixture
        }
    }, [root])
    return <MotionConfig reducedMotion='user'>
        <StoreContext.Provider value={root}><View root={root} /></StoreContext.Provider>
    </MotionConfig>
}
