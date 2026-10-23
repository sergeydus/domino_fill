"use client"
import { useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react'
import type { LevelStore } from '../stores/BoardsStore'
import { dayResults, type BoardState, type DayResults } from '../challenge/dayResults'
import { freezesBefore, milestoneOn } from '../challenge/streak'
import { inWindow } from '../challenge/window'
import { resolveSiteUrl } from '../siteMetadata'
import { control } from '../controls'
import { DIFFICULTY_NAME } from './difficultyName'
import { dayWords, formatTime, sizeWords } from './challengeText'
import { shareText } from './shareText'

/**
 * The day's results (slice 3b, rules 6, 7, 10 to 12): the nine boards and each size's line,
 * the streak, the countdown to tomorrow's boards, and Share.
 *
 * **A modal dialog with no new key** (rule 7). It is rendered outside the page's stage, and
 * the stage is `inert` while it is open, so nothing behind it can be reached. Inert alone
 * doesn't keep Tab inside, though (codex measured Tab going on to the page's body), so two
 * focus guards, first and last, send focus round to the other end. Tab itself is never
 * listened for, and there is no Escape: the archive has none, and a new key would break
 * the no-shortcuts decision.
 *
 * It describes the day it opened on, with the boards captured then (`levels.results`), and
 * closes itself once that day leaves the window, when its results are an archive day's.
 */

type Props = { levels: LevelStore }

const SQUARE: Record<BoardState['kind'], string> = {
    'solved': '🟩', 'untimed': '🟩', 'given-up': '⬛', 'in-play': '⬜', 'not-started': '⬜',
}

const square = (state: BoardState) =>
    (state.kind === 'solved' || state.kind === 'untimed') && state.assisted ? '🟨' : SQUARE[state.kind]

/** A board's line, in the clock line's words where they overlap (3a, rule 13). */
const boardWords = (state: BoardState): string => {
    switch (state.kind) {
        case 'solved': return `${formatTime(state.ms)} · ${state.assisted ? 'hints used' : 'no hints'}`
        case 'untimed': return state.assisted ? 'no time · hints used' : 'no time'
        case 'given-up': return 'given up'
        case 'in-play': return 'in play'
        case 'not-started': return 'not played'
    }
}

/** The local midnight that starts the day after `date`: a daylight-saving day's real length. */
const midnightAfter = (date: string): number => {
    const [year, month, day] = date.split('-').map(Number)
    return new Date(year, month - 1, day + 1).getTime()
}

/** Where focus goes when the dialog closes: the first of these that is still usable. */
const restoreFocus = (opener: Element | null) => {
    // Not the page's body: that is where focus is when nothing has it, not a place to return to.
    const usable = (el: Element | null): el is HTMLElement =>
        el instanceof HTMLElement && el !== document.body && el.isConnected && !el.closest('[inert]')
    const target = [opener, document.querySelector('[data-open-results]'), document.querySelector('[data-open-archive]')]
        .find(usable)
    target?.focus()
}

const ResultsDialog: React.FC<Props> = ({ levels }) => {
    const challenge = levels.rootStore.challenge!
    const day = levels.results!
    const headingRef = useRef<HTMLHeadingElement | null>(null)
    const shareRef = useRef<HTMLButtonElement | null>(null)
    const closeRef = useRef<HTMLButtonElement | null>(null)
    const fallbackRef = useRef<HTMLTextAreaElement | null>(null)
    // Read once, as the dialog opens: who had focus, and where the countdown ends.
    const [opener] = useState<Element | null>(() => document.activeElement)
    const [target] = useState(() => midnightAfter(challenge.deviceDate))
    const [copied, setCopied] = useState(false)
    const [fallback, setFallback] = useState<{ text: string, focus: boolean } | null>(null)

    const results: DayResults = dayResults(day.date, day.boards, challenge.history)
    const streak = challenge.streak
    const expired = !inWindow(day.date, challenge.deviceDate)

    useEffect(() => {
        headingRef.current?.focus()
        // After the commit that removes the dialog has lifted the stage's `inert`.
        return () => queueMicrotask(() => restoreFocus(opener))
    }, [opener])

    useEffect(() => { if (expired) levels.closeResults() }, [expired, levels])

    useEffect(() => {
        if (!copied) return
        const timer = setTimeout(() => setCopied(false), 3000)
        return () => clearTimeout(timer)
    }, [copied])

    useEffect(() => {
        if (!fallback?.focus) return
        fallbackRef.current?.focus()
        fallbackRef.current?.select()
    }, [fallback])

    const share = () => {
        const text = shareText(results, streak.streak, resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL))
        // The clipboard can refuse late, after the dialog closed or focus moved on (rule 7).
        // Once it has closed, nothing here renders any more; while it's open, the box takes
        // focus only if the player is still on Share, waiting for it.
        const refused = () => {
            setCopied(false)
            setFallback({ text, focus: document.activeElement === shareRef.current })
        }
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
        if (!clipboard?.writeText) return refused()
        clipboard.writeText(text).then(() => setCopied(true), refused)
    }

    const remaining = target - challenge.now.wall
    const milestone = milestoneOn(streak, day.date)
    const frozen = freezesBefore(streak, day.date)

    return (
        <div
            data-results
            role='dialog'
            aria-modal='true'
            aria-labelledby='results-heading'
            className='fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4'
        >
            <div className='max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-surface p-4 text-ink'>
                {/* To the last control there is: the text box once Share has shown it (codex). */}
                <div tabIndex={0} data-focus-guard='start'
                    onFocus={() => (fallbackRef.current ?? closeRef.current)?.focus()} />
                <h2 id='results-heading' ref={headingRef} tabIndex={-1} data-results-heading
                    className='mb-3 text-display'>
                    Results · {dayWords(day.date)}
                </h2>

                {results.sizes.map(row => (
                    <section key={row.difficulty} data-results-size={row.difficulty} className='mb-3'>
                        <h3 className='text-body font-extrabold'>
                            {DIFFICULTY_NAME[row.difficulty]} · {row.size}×{row.size}
                        </h3>
                        <ul aria-label={`${DIFFICULTY_NAME[row.difficulty]} puzzles`} className='text-body'>
                            {row.boards.map((state, index) => (
                                <li key={index} data-results-board={state.kind} className='tabular-nums'>
                                    <span aria-hidden='true'>{square(state)} </span>
                                    Puzzle {index + 1}: {boardWords(state)}
                                </li>
                            ))}
                        </ul>
                        <p data-results-total className='text-body font-bold tabular-nums'>
                            {row.result.kind === 'total' ? 'Total ' : ''}{sizeWords(row.result)}
                        </p>
                    </section>
                ))}

                {streak.playedEver && (
                    <p data-results-streak className='text-body'>
                        <span aria-hidden='true'>🔥 </span>{streak.streak}-day streak
                        {streak.freezes > 0 && (
                            <> · <span aria-hidden='true'>❄️ </span>
                                {streak.freezes} {streak.freezes === 1 ? 'freeze' : 'freezes'}</>
                        )}
                    </p>
                )}
                {milestone !== null && (
                    <p data-results-milestone className='text-body font-extrabold'>
                        <span aria-hidden='true'>🎉 </span>{milestone}-day streak!
                    </p>
                )}
                {frozen.map(date => (
                    <p key={date} data-results-frozen className='text-body'>
                        <span aria-hidden='true'>❄️ </span>A freeze kept your streak on {dayWords(date)}
                    </p>
                ))}

                <p data-results-countdown className='mt-3 text-body tabular-nums'>
                    {remaining > 0 ? `Next challenge in ${formatTime(remaining)}` : 'Today\'s challenge is ready'}
                </p>

                <div className='mt-4 flex flex-row gap-2'>
                    <button type='button' ref={shareRef} data-results-share className={control('primary')} onClick={share}>
                        Share
                    </button>
                    <button type='button' ref={closeRef} data-results-close className={control('raised')}
                        onClick={() => levels.closeResults()}>
                        Close
                    </button>
                </div>
                <p role='status' data-results-copied className='mt-2 text-body'>{copied ? 'Copied' : ''}</p>
                {fallback && (
                    <label className='mt-2 flex flex-col gap-1 text-body'>
                        Copy this text
                        <textarea ref={fallbackRef} data-results-fallback readOnly rows={6}
                            value={fallback.text} className='rounded border p-2 text-meta' />
                    </label>
                )}
                <div tabIndex={0} data-focus-guard='end' onFocus={() => shareRef.current?.focus()} />
            </div>
        </div>
    )
}

export default observer(ResultsDialog)
