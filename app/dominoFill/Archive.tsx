"use client"
import { useCallback, useEffect, useState } from 'react'
import { observer } from 'mobx-react'
import type { LevelStore } from '../stores/BoardsStore'
import type { CorpusSource } from '../stores/corpusSource'
import { addMonths, datesIn, monthOf, type Chunk, type Manifest } from '../stores/corpus'
import { readAllProgress, type PuzzleProgress } from '../stores/progressStorage'
import { markForDay, type DayMark } from '../stores/dayMark'

/**
 * Every published day, reachable (spec P1-6, row 18d).
 *
 * This is what the date index was *for*. `daysSinceEpoch % 2` gave no permanent
 * date→puzzle relation, so there was nothing an archive could name: "the puzzle for the
 * 14th" was whichever of two packs the arithmetic happened to land on, and it would be a
 * different one next month. With the corpus each date has one answer, forever, and a list
 * of dates becomes a list of puzzles.
 *
 * It also discharges the other half of P1-7's rollover obligation. Holding a new day back
 * keeps an in-play board on screen; this is what makes the day someone *left* — finished or
 * not — somewhere they can return to rather than something that fell off the end.
 *
 * **Completion marks come from the chunk, not from parsing an id.** A record is stored
 * under its `puzzleId`, and the id encodes its date, so it is tempting to read the date back
 * out of the key. That is exactly the derivation the spec forbids — an id is opaque, and
 * treating it as parseable is how content identity and state identity re-entangle. The month
 * being displayed is fetched anyway to know which dates exist, so its real ids are already
 * to hand: the marks are looked up, not inferred. They are also *checked* rather than
 * believed; `markForDay` says why.
 *
 * **The calendar is bounded by the day that can actually be served**, not by the device
 * clock. They are the same thing until the clock is outside the published range, and then
 * they are very different: a clock set before the corpus made every published day "in the
 * future" and emptied the archive entirely, including the day being played at the time.
 */

type Props = {
    boardsStore: LevelStore
    corpus: CorpusSource
    /** Load a date and put it on screen. Explicit, so it always applies. */
    onPick: (date: string) => Promise<void>
}

const MARK_CLASS: Record<DayMark, string> = {
    none: 'bg-mark-none',
    started: 'bg-mark-started',
    partial: 'bg-mark-partial',
    complete: 'bg-mark-complete',
}

const MARK_LABEL: Record<DayMark, string> = {
    none: 'not played',
    started: 'in progress',
    partial: 'partly finished',
    complete: 'all nine finished',
}

const Archive: React.FC<Props> = ({ boardsStore, corpus, onPick }) => {
    const viewingDate = boardsStore.viewingDate

    /*
     * Mounted only while it is open, so opening *is* mounting.
     *
     * That is what lets the two things the panel needs on arrival -- the saved records and
     * which month to show -- be initial state rather than an effect. Writing them from an
     * effect is a cascading render and React's lint rule says so; the rule is right, because
     * neither is synchronising with anything. They are just what this component starts with.
     *
     * It also means a player who never opens the archive pays for none of it: the manifest
     * is 30 KB and a month chunk is another 104 KB, and neither is fetched until now.
     * `CorpusSource` caches both, so a second opening costs nothing and the month the player
     * is already on has usually been fetched by the board itself.
     */
    // Read once, at open. Another tab may have played since; the store's own `saved` is
    // filtered to the day it is serving, so it cannot answer for the rest of the archive.
    const [progress] = useState<Record<string, PuzzleProgress>>(() => readAllProgress())
    // One instant for the whole panel, taken when it opens: retention is measured against
    // it, and a mark that changed halfway down the grid would be a worse answer than a
    // slightly stale one.
    const [now] = useState(() => Date.now())
    const [month, setMonth] = useState<string>(
        () => monthOf(viewingDate ?? boardsStore.today ?? ''))
    const [manifest, setManifest] = useState<Manifest | null>(null)
    const [chunk, setChunk] = useState<Chunk | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let live = true
        corpus.loadManifest()
            .then(loaded => { if (live) setManifest(loaded) })
            .catch(() => { if (live) setError('The archive index could not be loaded.') })
        return () => { live = false }
    }, [corpus])

    useEffect(() => {
        let live = true
        corpus.loadChunk(month)
            .then(loaded => { if (live) setChunk(loaded) })
            .catch(() => { if (live) setError(`${month} could not be loaded.`) })
        return () => { live = false }
    }, [month, corpus])

    const pick = useCallback(async (date: string) => {
        try {
            await onPick(date)
            boardsStore.setArchiveOpen(false)
        } catch {
            setError(`${date} could not be loaded.`)
        }
    }, [onPick, boardsStore])

    const today = boardsStore.today
    // Days after today are published but have not happened. Serving them would hand out
    // tomorrow's puzzle, which is the one thing a daily game must not do.
    const days = manifest
        ? datesIn(month).filter(date =>
            date >= manifest.firstDate && date <= manifest.lastDate
            && (today === null || date <= today))
        : []

    const canGoBack = !!manifest && month > monthOf(manifest.firstDate)
    const canGoForward = !!manifest && today !== null && month < monthOf(today)

    return (
        <div
            data-archive
            role='dialog'
            aria-modal='true'
            aria-label='Puzzle archive'
            className='fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4'
        >
            <div className='max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-panel p-4'>
                <div className='mb-3 flex items-center justify-between gap-2'>
                    <button
                        type='button'
                        data-archive-prev
                        className='rounded-md border px-2 py-1 disabled:opacity-40'
                        disabled={!canGoBack}
                        onClick={() => setMonth(current => addMonths(current, -1))}
                        aria-label='Previous month'
                    >
                        ‹
                    </button>
                    <h2 data-archive-month className='font-semibold'>{month}</h2>
                    <button
                        type='button'
                        data-archive-next
                        className='rounded-md border px-2 py-1 disabled:opacity-40'
                        disabled={!canGoForward}
                        onClick={() => setMonth(current => addMonths(current, 1))}
                        aria-label='Next month'
                    >
                        ›
                    </button>
                </div>

                {error && <p role='alert' className='mb-2 text-sm text-problem'>{error}</p>}

                <div className='grid grid-cols-7 gap-1' role='group' aria-label={`Days in ${month}`}>
                    {days.map(date => {
                        const entry = chunk?.month === month
                            ? chunk.days.find(day => day.date === date)
                            : undefined
                        const puzzles = entry
                            ? [...entry.easyBoards, ...entry.mediumBoards, ...entry.hardBoards]
                            : []
                        const mark: DayMark = markForDay(puzzles, progress, now)
                        return (
                            <button
                                key={date}
                                type='button'
                                data-archive-day={date}
                                data-mark={mark}
                                aria-current={date === viewingDate ? 'date' : undefined}
                                aria-label={`${date}, ${MARK_LABEL[mark]}`}
                                // Until the chunk lands there are no ids, so a mark would be
                                // a guess. The day is still selectable: picking it fetches
                                // the month anyway.
                                className={`rounded-md border p-1 text-xs ${MARK_CLASS[mark]} `
                                    + (date === viewingDate ? 'ring-2 ring-accent-edge' : '')}
                                onClick={() => { void pick(date) }}
                            >
                                {Number(date.slice(8))}
                            </button>
                        )
                    })}
                </div>

                <button
                    type='button'
                    data-archive-close
                    className='mt-4 w-full rounded-md bg-strong-surface px-3 py-2 font-semibold text-on-strong'
                    onClick={() => boardsStore.setArchiveOpen(false)}
                >
                    Close
                </button>
            </div>
        </div>
    )
}

export default observer(Archive)
