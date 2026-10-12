// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { CorpusSource, type LoadedDay } from '@/app/stores/corpusSource'
import type { DayEntry } from '@/app/stores/corpus'
import { StoreContext } from '@/app/provider'
import DominoClient from '@/app/dominoFill/DominoClient'
import { localStorageStore, type AttemptStore } from '@/app/challenge/attemptStore'
import { RULESET, type Attempt } from '@/app/challenge/attempt'
import { addDays } from '@/app/challenge/window'

/*
 * Slice 3b, rules 6, 7 and 9 to 13: the results screen, the Results button and the streak
 * beside Archive, rendered through the real `DominoClient` with an enabled root. The same
 * harness as `challengeUi.test.tsx`: only layout, the tutorial and sound are stubbed.
 */
vi.mock('@/app/hooks/useAvailableBoardBox', () => ({ useAvailableBoardBox: () => null }))
vi.mock('@/app/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/app/dominoFill/Tutorial', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/feedback', () => ({
    winFeedback: vi.fn(), feedbackFor: vi.fn(), preloadSounds: vi.fn(), unlockSounds: vi.fn(async () => true),
}))

const DAY = '2026-10-10'
const T0 = new Date(2026, 9, 10, 12).getTime()
const day = (date = DAY): DayEntry => {
    const boards = (size: string) => [1, 2, 3].map(n => ({
        puzzleId: `${date}|${size}${n}`, board: [[null, null], [null, null]],
        boardHorizontalNumbers: '1,1', boardVerticalNumbers: '2,0',
    }))
    return { date, easyBoards: boards('e'), mediumBoards: boards('m'), hardBoards: boards('h') }
}
const loaded = (date: string, clamped: LoadedDay['clamped'] = null): LoadedDay =>
    ({ day: day(date), requested: date, clamped })

/**
 * A board's definition hash, as the store computes it, for any day's boards (the test's IDs
 * start with their date). Real hashes everywhere, so an attempt is ignored only when a test
 * means it to be: the archive-day test once passed for the wrong reason, a made-up hash.
 */
const hashOf = (() => {
    const cache = new Map<string, string>()
    const learn = (date: string) => {
        const probe = new RootStore(new CorpusSource())
        probe.boardsStore.setDay(day(date))
        for (const difficulty of ['easy', 'normal', 'hard'] as const) {
            for (const level of [1, 2, 3] as const) {
                probe.boardsStore.goToBoard({ difficulty, level })
                const { definition } = probe.boardsStore.currentBoard!
                cache.set(definition.puzzleId, definition.definitionHash)
            }
        }
        probe.boardsStore.disposePersist?.()
    }
    return (puzzleId: string): string => {
        const date = puzzleId.split('|')[0]
        if (!cache.has(puzzleId) && /^\d{4}-\d{2}-\d{2}$/.test(date)) learn(date)
        return cache.get(puzzleId) ?? 'past-day'
    }
})()

/** A stored attempt that `isAttempt` accepts. */
const attempt = (puzzleId: string, date: string,
    outcome: 'solved' | 'hinted' | 'untimed' | 'untimed-hinted' | 'given-up' | 'in-play',
    ms = 60_000): Attempt => {
    const base: Attempt = { puzzleId, definitionHash: hashOf(puzzleId), date, ruleset: RULESET,
        startedAt: T0 - 3_600_000, assisted: outcome === 'hinted' || outcome === 'untimed-hinted', clockError: false }
    switch (outcome) {
        case 'solved': case 'hinted':
            return { ...base, result: { kind: 'solved', ms }, finishedAt: base.startedAt + ms }
        case 'untimed': case 'untimed-hinted':
            return { ...base, clockError: true, result: { kind: 'untimed', reason: 'clock-error' }, finishedAt: base.startedAt + 1 }
        case 'given-up': return { ...base, result: { kind: 'given-up' } }
        case 'in-play': return base
    }
}
const seed = async (store: AttemptStore, attempts: Attempt[]) => {
    for (const a of attempts) await store.change(a.puzzleId, () => ({ next: a, changed: true }))
}
/** One solved past board on each of these dates, for the streak. */
const pastDays = (dates: string[]) => dates.map(date => attempt(`${date}|past`, date, 'solved'))

const roots: RootStore[] = []
const mount = async ({ challenge = true, attempts = [] as Attempt[], viewing = DAY,
    clamp = null as LoadedDay['clamped'] } = {}) => {
    let wall = T0
    vi.setSystemTime(new Date(wall))
    const store = localStorageStore(window.localStorage) as AttemptStore
    await seed(store, attempts)
    const corpus = new CorpusSource()
    vi.spyOn(corpus, 'loadDay').mockImplementation(async requested => loaded(requested, clamp))
    const root = new RootStore(corpus, { challenge, coordinator: {
        clock: () => ({ wall, mono: 100 + (wall - T0) }), openStore: async () => store,
        loadDay: async date => loaded(date, clamp), listen: () => () => {}, schedule: () => () => {},
    } })
    roots.push(root)
    await act(async () => {
        await root.start()
        render(<StoreContext.Provider value={root}><DominoClient /></StoreContext.Provider>)
    })
    await screen.findByRole('button', { name: 'Archive' })
    if (viewing !== DAY) await act(async () => { root.boardsStore.setDay(day(viewing)) })
    return {
        root, store, levels: root.boardsStore,
        /** Move the clock, and let what the tick starts (a new day's refresh) finish inside act. */
        setTime: (value: number) => act(async () => {
            wall = value
            vi.setSystemTime(new Date(wall))
            root.challenge?.tick()
            await root.challenge?.refresh()
        }),
    }
}

const dialog = () => document.querySelector<HTMLElement>('[data-results]')
const resultsButton = () => screen.queryByRole('button', { name: 'Results' })
const streakCount = () => document.querySelector('[data-streak-count]')
const openByButton = async () => {
    const button = resultsButton()!
    button.focus()
    await act(async () => { fireEvent.click(button) })
    expect(dialog()).not.toBeNull()
}

beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('hasSeenTutorial', 'true')
})
afterEach(() => {
    cleanup()
    for (const root of roots.splice(0)) {
        root.dispose()
        root.boardsStore.disposePersist?.()
    }
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('beside Archive (rules 9 and 13)', () => {
    it('shows neither Results nor a streak to a player who has never played', async () => {
        await mount()
        expect(resultsButton()).toBeNull()
        expect(streakCount()).toBeNull()
    })

    it('shows Results once one of the day\'s boards has a result, and the streak once played', async () => {
        await mount({ attempts: [attempt(`${DAY}|e2`, DAY, 'solved')] })
        expect(resultsButton()).not.toBeNull()
        expect(streakCount()?.textContent).toBe('🔥 11-day streak')
        expect(streakCount()?.querySelector('[aria-hidden="true"]')?.textContent).toBe('🔥 1')
    })

    it('shows Results for a given-up board, but no streak for it alone', async () => {
        await mount({ attempts: [attempt(`${DAY}|e2`, DAY, 'given-up')] })
        expect(resultsButton()).not.toBeNull()
        expect(streakCount()).toBeNull()
    })

    it('shows "🔥 0" to a player whose streak broke', async () => {
        await mount({ attempts: pastDays(['2026-10-01']) })
        expect(streakCount()?.querySelector('[aria-hidden="true"]')?.textContent).toBe('🔥 0')
        expect(resultsButton()).toBeNull()
    })

    it('shows no Results on an archive day, and keeps the streak there', async () => {
        await mount({ attempts: [attempt(`2026-10-01|e1`, '2026-10-01', 'solved')], viewing: '2026-10-01' })
        expect(resultsButton()).toBeNull()
        expect(streakCount()).not.toBeNull()
    })

    it('shows no Results on a day served casually by a clock set before the corpus', async () => {
        await mount({ attempts: [attempt(`${DAY}|e2`, DAY, 'solved')], clamp: 'before' })
        expect(mountedLevels().viewingClamp).toBe('before')
        expect(resultsButton()).toBeNull()
    })

    it('shows neither with the challenge off, whatever is stored', async () => {
        await mount({ challenge: false, attempts: [attempt(`${DAY}|e2`, DAY, 'solved')] })
        expect(resultsButton()).toBeNull()
        expect(streakCount()).toBeNull()
    })
})

describe('the results screen (rule 6)', () => {
    it('says every board\'s state in words, and each size\'s line', async () => {
        await mount({ attempts: [
            attempt(`${DAY}|e1`, DAY, 'solved', 83_000), attempt(`${DAY}|e2`, DAY, 'hinted', 61_000),
            attempt(`${DAY}|e3`, DAY, 'untimed'),
            attempt(`${DAY}|m1`, DAY, 'solved', 1_000), attempt(`${DAY}|m2`, DAY, 'solved', 2_000),
            attempt(`${DAY}|m3`, DAY, 'untimed-hinted'),
            attempt(`${DAY}|h1`, DAY, 'given-up'), attempt(`${DAY}|h2`, DAY, 'in-play'),
        ] })
        await openByButton()
        expect(dialog()!.querySelector('[data-results-heading]')?.textContent).toBe('Results · 10 Oct 2026')
        const lines = (difficulty: string) =>
            [...dialog()!.querySelectorAll(`[data-results-size="${difficulty}"] li`)].map(li => li.textContent)
        expect(lines('easy')).toEqual(['🟩 Puzzle 1: 1:23 · no hints', '🟨 Puzzle 2: 1:01 · hints used', '🟩 Puzzle 3: no time'])
        expect(lines('normal')).toEqual(['🟩 Puzzle 1: 0:01 · no hints', '🟩 Puzzle 2: 0:02 · no hints', '🟨 Puzzle 3: no time · hints used'])
        expect(lines('hard')).toEqual(['⬛ Puzzle 1: given up', '⬜ Puzzle 2: in play', '⬜ Puzzle 3: not played'])
        const totals = [...dialog()!.querySelectorAll('[data-results-total]')].map(p => p.textContent)
        expect(totals).toEqual(['partial', 'partial', 'partial'])
        // The squares are decoration: every line says its state in words.
        const squares = dialog()!.querySelectorAll('li > [aria-hidden="true"]')
        expect(squares).toHaveLength(9)
        for (const square of squares) {
            expect(square.textContent).toMatch(/^(🟩|🟨|⬛|⬜) $/)
        }
    })

    it('shows the streak, saved freezes and the milestone reached today', async () => {
        // Six days played before today (two freezes earned), and today: seven.
        const before = Array.from({ length: 6 }, (_, n) => addDays(DAY, n - 6))
        await mount({ attempts: [...pastDays(before), attempt(`${DAY}|e1`, DAY, 'solved')] })
        await openByButton()
        expect(dialog()!.querySelector('[data-results-streak]')?.textContent).toBe('🔥 7-day streak · ❄️ 2 freezes')
        expect(dialog()!.querySelector('[data-results-milestone]')?.textContent).toBe('🎉 7-day streak!')
    })

    it('names a freeze used, on the results of the day after it', async () => {
        // Played 6, 7 and 8 Oct (a freeze), not 9 Oct, and today, 10 Oct: on the 10th the 9th
        // is still playable, so yesterday's results, the 9th's, are where nothing is frozen
        // yet; a gap two days back is. Here: played 5 to 7 Oct, missed the 8th, played the 9th.
        await mount({
            attempts: [...pastDays(['2026-10-05', '2026-10-06', '2026-10-07']),
                attempt(`2026-10-09|e1`, '2026-10-09', 'solved')],
            viewing: '2026-10-09',
        })
        await act(async () => { (await screen.findByRole('button', { name: 'Results' })).click() })
        expect([...dialog()!.querySelectorAll('[data-results-frozen]')].map(p => p.textContent))
            .toEqual(['❄️ A freeze kept your streak on 8 Oct 2026'])
        // The freeze was spent: none saved, so none mentioned beside the streak.
        expect(dialog()!.querySelector('[data-results-streak]')?.textContent).toBe('🔥 4-day streak')
        expect(dialog()!.querySelector('[data-results-milestone]')).toBeNull()
    })
})

describe('the dialog\'s focus (rule 7)', () => {
    const played = () => [attempt(`${DAY}|e2`, DAY, 'solved')]

    it('focuses the heading, leaves the page behind inert, and gives focus back on closing', async () => {
        await mount({ attempts: played() })
        await openByButton()
        expect(document.activeElement).toBe(dialog()!.querySelector('[data-results-heading]'))
        expect(document.querySelector('[data-stage]')?.hasAttribute('inert')).toBe(true)
        expect(dialog()!.closest('[inert]')).toBeNull()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close' })) })
        await act(async () => { await Promise.resolve() })
        expect(dialog()).toBeNull()
        expect(document.querySelector('[data-stage]')?.hasAttribute('inert')).toBe(false)
        expect(document.activeElement).toBe(resultsButton())
    })

    it('wraps Tab both ways through its focus guards', async () => {
        await mount({ attempts: played() })
        await openByButton()
        act(() => { dialog()!.querySelector<HTMLElement>('[data-focus-guard="end"]')!.focus() })
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Share' }))
        act(() => { dialog()!.querySelector<HTMLElement>('[data-focus-guard="start"]')!.focus() })
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    })

    it('falls back to Results, then to Archive, when what had focus is gone', async () => {
        await mount({ attempts: played() })
        // Opened with nothing focused: focus goes to Results on closing.
        ;(document.activeElement as HTMLElement | null)?.blur()
        await act(async () => { mountedLevels().openResults() })
        await act(async () => { mountedLevels().closeResults() })
        await act(async () => { await Promise.resolve() })
        expect(document.activeElement).toBe(resultsButton())
        cleanup()

        // No result on the day, so no Results button: Archive.
        window.localStorage.clear()
        window.localStorage.setItem('hasSeenTutorial', 'true')
        await mount()
        expect(resultsButton()).toBeNull()
        ;(document.activeElement as HTMLElement | null)?.blur()
        await act(async () => { mountedLevels().openResults() })
        expect(dialog()).not.toBeNull()
        await act(async () => { mountedLevels().closeResults() })
        await act(async () => { await Promise.resolve() })
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Archive' }))
    })

    it('is never open with the archive', async () => {
        const m = await mount({ attempts: played() })
        await openByButton()
        await act(async () => { m.levels.setArchiveOpen(true) })
        expect(dialog()).toBeNull()
        expect(document.querySelector('[data-archive]')).not.toBeNull()
        await act(async () => { m.levels.openResults() })
        expect(document.querySelector('[data-archive]')).toBeNull()
        expect(dialog()).not.toBeNull()
    })
})

/** The levels store of the most recent mount. */
const mountedLevels = () => roots[roots.length - 1].boardsStore

describe('Share (rules 10 and 11)', () => {
    const played = () => [attempt(`${DAY}|e1`, DAY, 'solved', 83_000)]
    const stubClipboard = (writeText: (text: string) => Promise<void>) => {
        const spy = vi.fn(writeText)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: spy }, configurable: true })
        return spy
    }
    afterEach(() => { Reflect.deleteProperty(navigator, 'clipboard') })

    it('copies the text and says so once', async () => {
        const write = stubClipboard(async () => {})
        await mount({ attempts: played() })
        await openByButton()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share' })) })
        expect(write).toHaveBeenCalledWith([
            'Domino Fill · 10 Oct 2026', '2×2 🟩⬜⬜ partial', '2×2 ⬜⬜⬜ partial', '2×2 ⬜⬜⬜ partial',
            '🔥 1-day streak', 'domino-fill.vercel.app',
        ].join('\n'))
        expect(dialog()!.querySelector('[data-results-copied]')?.textContent).toBe('Copied')
        expect(dialog()!.querySelector('[data-results-copied]')?.getAttribute('role')).toBe('status')
        expect(dialog()!.querySelector('[data-results-fallback]')).toBeNull()
    })

    it('shows the text to copy by hand, focused, when the clipboard refuses while on Share', async () => {
        stubClipboard(async () => { throw new Error('denied') })
        await mount({ attempts: played() })
        await openByButton()
        const share = screen.getByRole('button', { name: 'Share' })
        share.focus()
        await act(async () => { fireEvent.click(share) })
        const box = dialog()!.querySelector<HTMLTextAreaElement>('[data-results-fallback]')!
        expect(box.value).toContain('Domino Fill · 10 Oct 2026')
        expect(document.activeElement).toBe(box)
    })

    it('shows it without moving focus when the refusal arrives after focus moved on', async () => {
        let refuse!: () => void
        stubClipboard(() => new Promise((_, reject) => { refuse = () => reject(new Error('denied')) }))
        await mount({ attempts: played() })
        await openByButton()
        const share = screen.getByRole('button', { name: 'Share' })
        share.focus()
        await act(async () => { fireEvent.click(share) })
        const close = screen.getByRole('button', { name: 'Close' })
        close.focus()
        await act(async () => { refuse() })
        expect(dialog()!.querySelector('[data-results-fallback]')).not.toBeNull()
        expect(document.activeElement).toBe(close)
    })

    it('does nothing when the refusal arrives after the dialog closed', async () => {
        let refuse!: () => void
        stubClipboard(() => new Promise((_, reject) => { refuse = () => reject(new Error('denied')) }))
        await mount({ attempts: played() })
        await openByButton()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share' })) })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close' })) })
        await act(async () => { await Promise.resolve() })
        const focused = document.activeElement
        await act(async () => { refuse() })
        expect(dialog()).toBeNull()
        expect(document.querySelector('[data-results-fallback]')).toBeNull()
        expect(document.activeElement).toBe(focused)
    })

    it('shows the text at once where there is no clipboard', async () => {
        await mount({ attempts: played() })
        await openByButton()
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share' })) })
        expect(dialog()!.querySelector('[data-results-fallback]')).not.toBeNull()
    })
})

describe('the countdown (rule 12)', () => {
    const played = () => [attempt(`${DAY}|e1`, DAY, 'solved')]
    const countdown = () => dialog()?.querySelector('[data-results-countdown]')?.textContent

    it('counts to the next local midnight, from a target fixed at opening, and stops there', async () => {
        const m = await mount({ attempts: played() })
        await openByButton()
        expect(countdown()).toBe('Next challenge in 12:00:00')
        await m.setTime(T0 + 1_000)
        expect(countdown()).toBe('Next challenge in 11:59:59')
        const midnight = new Date(2026, 9, 11).getTime()
        await m.setTime(midnight + 1_000)
        // Not a new countdown to the following midnight: the target was fixed.
        expect(countdown()).toBe('Today\'s challenge is ready')
        await m.setTime(midnight + 3_600_000)
        expect(countdown()).toBe('Today\'s challenge is ready')
        // Reopened, on what is now yesterday's results: a new target.
        await act(async () => { m.levels.closeResults() })
        await act(async () => { m.levels.openResults() })
        expect(countdown()).toBe('Next challenge in 23:00:00')
    })

    it('closes the dialog once its date leaves the window', async () => {
        const m = await mount({ attempts: played() })
        await openByButton()
        await m.setTime(new Date(2026, 9, 11, 23, 59).getTime())
        expect(dialog()).not.toBeNull()
        await m.setTime(new Date(2026, 9, 12, 0, 0, 1).getTime())
        await waitFor(() => expect(dialog()).toBeNull())
    })
})
