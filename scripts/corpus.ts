import { createHash } from "node:crypto"
import { definitionFrom, type StoredPuzzle } from "../app/stores/PuzzleDefinition"
import { solve } from "../app/stores/solver"
import {
    addDays, addMonths, datesIn, monthOf, monthsBetween,
    type Chunk, type ChunkRef, type DayEntry, type Manifest,
} from "../app/stores/corpus"
import { generateBoard } from "./generate-boards"

/*
 * The published shape and the date arithmetic live under `app/stores/corpus.ts`, because the
 * runtime loader (row 18d) needs them and cannot import this file -- `node:crypto` and the
 * generator are not browser code. Re-exported here so the pipeline and its tests keep one
 * import to reason about.
 */
export {
    addDays, addMonths, clampToCorpus, datesIn, isoDate, monthOf, monthsBetween, parseDate,
} from "../app/stores/corpus"
export type { Chunk, ChunkRef, DayEntry, Manifest } from "../app/stores/corpus"

/**
 * The content pipeline (spec P1-6, row 18c).
 *
 * The game ships a fixed horizon of pre-generated puzzles rather than generating at runtime,
 * because the generator is exponential and a browser cannot be asked to run it. The horizon
 * is large — ten years — so two things have to be true of it that were not true of the two
 * rotating day-entries it replaces:
 *
 * **It must be reproducible.** Every puzzle is a pure function of `(CORPUS_VERSION,
 * CORPUS_SEED, date, slot)`, so regenerating produces the same bytes. Without that, a rebuild
 * is a content change and there is no way to tell a deliberate one from an accident.
 *
 * **It must be append-only.** A date that has been published is a promise: a player's saved
 * progress, their archive, and their memory of yesterday's puzzle all point at it. The build
 * refuses to change any date already in the committed index, and only ever adds later ones.
 *
 * Everything here is pure and data-in/data-out; the file writing lives in `build-corpus.ts`,
 * so the rules can be tested without a filesystem.
 */

/**
 * Bumped only for a deliberate, breaking change to how puzzles are generated.
 *
 * It is part of every seed, so changing it changes every puzzle — which is exactly why it
 * must never be bumped casually. Existing dates are protected by the append-only check
 * regardless, so a bump can only affect dates that have not been published yet.
 */
export const CORPUS_VERSION = 1

/** The root seed. Fixed forever, for the same reason as `CORPUS_VERSION`. */
export const CORPUS_SEED = 0x5ca1ab1e

/**
 * The first day the corpus covers. **Fixed forever.**
 *
 * Changing it would re-point every published date onto a different puzzle, which is the
 * failure the append-only rule exists to prevent. The build asserts that the committed index
 * still starts here.
 */
export const CORPUS_START_MONTH = '2026-09'

/** Ten years of content, in whole months so chunk boundaries are clean. */
export const CORPUS_MONTHS = 120

/**
 * How far ahead the corpus must always reach before CI complains.
 *
 * Checked against the **last indexed date**, not against a count of files: a count says
 * nothing about whether the content has been overtaken by the calendar.
 */
export const HORIZON_WARNING_MONTHS = 12

/**
 * The nine puzzles of a day.
 *
 * Three difficulties of three levels, differing only by rock count — the shape the runtime
 * already expects, kept so 18d is a loader change and not a redesign. Note that fewer rocks
 * means *more* playable cells and a longer puzzle, so the levels ramp upward within a
 * difficulty; the spec's separate complaint that this ramp is one notch wide is a content
 * design question, not a pipeline one, and is deliberately not addressed here.
 */
export const SLOTS = [
    { group: 'easyBoards', level: 1, size: 6, rocks: 8 },
    { group: 'easyBoards', level: 2, size: 6, rocks: 6 },
    { group: 'easyBoards', level: 3, size: 6, rocks: 4 },
    { group: 'mediumBoards', level: 1, size: 7, rocks: 9 },
    { group: 'mediumBoards', level: 2, size: 7, rocks: 7 },
    { group: 'mediumBoards', level: 3, size: 7, rocks: 5 },
    { group: 'hardBoards', level: 1, size: 8, rocks: 10 },
    { group: 'hardBoards', level: 2, size: 8, rocks: 8 },
    { group: 'hardBoards', level: 3, size: 8, rocks: 6 },
] as const

export type SlotGroup = typeof SLOTS[number]['group']

/** The three groups, in order, deduplicated from `SLOTS` so the two cannot drift apart. */
export const GROUPS = [...new Set(SLOTS.map(slot => slot.group))] as SlotGroup[]

/** One day's nine puzzles, in the shape the runtime's `BoardsResponse` already has. */
// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * A seed for one slot on one day.
 *
 * FNV-1a over the inputs, so the seed depends on all of them and neighbouring dates do not
 * produce neighbouring streams. The version and the root seed are folded in, which is what
 * makes `CORPUS_VERSION` a real lever rather than documentation.
 */
export const seedFor = (date: string, group: string, level: number, reroll = 0): number => {
    // `reroll` is folded in only when it is non-zero, so introducing re-rolling left every
    // puzzle that did not collide exactly as it was. The corpus diff then shows only the
    // boards that actually changed, which is the difference between a reviewable change and
    // a thirty-thousand-file one.
    const parts = reroll === 0
        ? [String(CORPUS_VERSION), date, group, String(level)]
        : [String(CORPUS_VERSION), date, group, String(level), `r${reroll}`]

    let hash = 0x811c9dc5 ^ CORPUS_SEED
    for (const part of parts) {
        for (let i = 0; i < part.length; i++) {
            hash ^= part.charCodeAt(i)
            hash = Math.imul(hash, 0x01000193) >>> 0
        }
        hash ^= 0x2f
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash >>> 0
}

/** xorshift32. Small, and identical on every machine — which is the whole requirement. */
export const rngFrom = (seed: number): (() => number) => {
    // 0 is a fixed point of xorshift, so a seed that lands on it is nudged off.
    let state = (seed >>> 0) || 0x9e3779b9
    return () => {
        state ^= state << 13; state >>>= 0
        state ^= state >>> 17
        state ^= state << 5; state >>>= 0
        return state / 0x100000000
    }
}

/**
 * The permanent identity of one puzzle.
 *
 * Derived from the date and slot rather than from a counter, so it is stable under
 * regeneration and says what it points at. `v1-000-easy-1` — the old positional scheme — could
 * not survive a reordering of the data file; this cannot be reordered.
 */
export const puzzleIdFor = (date: string, group: SlotGroup, level: number): string =>
    `v${CORPUS_VERSION}-${date}-${group.replace('Boards', '')}-${level}`

/**
 * One slot of one day.
 *
 * Exported so the failure path below is reachable from a test. It has never fired for the
 * configured slots — which is exactly why it is worth testing deliberately rather than
 * trusting: mutation-testing showed that deleting the guard changed nothing any test could
 * see, because nothing ever asked for a slot that could fail.
 *
 * `attempts` is an override for that purpose and for nothing else; the pipeline uses the
 * generator's own default.
 */
export const generateSlot = (
    date: string,
    slot: typeof SLOTS[number],
    options: { attempts?: number, seen?: Set<string> } = {},
): StoredPuzzle => {
    const { attempts, seen } = options

    for (let reroll = 0; reroll < MAX_REROLLS; reroll++) {
        const generated = generateBoard({
            size: slot.size,
            rocks: slot.rocks,
            random: rngFrom(seedFor(date, slot.group, slot.level, reroll)),
            ...(attempts === undefined ? {} : { attempts }),
        })
        if (!generated) {
            // Loud, not skipped. A day with eight puzzles would be a silent hole in the
            // calendar that surfaced only when a player reached it, years later.
            throw new Error(
                `no puzzle for ${date} ${slot.group} level ${slot.level} ` +
                `(${slot.size}x${slot.size}, ${slot.rocks} rocks) within the attempt budget`)
        }

        const puzzle: StoredPuzzle = {
            puzzleId: puzzleIdFor(date, slot.group, slot.level),
            board: generated.board,
            boardHorizontalNumbers: generated.boardHorizontalNumbers,
            boardVerticalNumbers: generated.boardVerticalNumbers,
        }
        if (!seen) return puzzle

        /*
         * "Exactly one solution" is not the same as "a new puzzle". The first corpus built
         * here contained 314 exact repeats among 32,877 entries -- 297 easy, 17 medium, none
         * hard -- and the closest pair was four days apart. A player meeting the same board
         * twice in a week has no way to read that as anything but the game being broken.
         *
         * Re-rolling is deterministic: the same date and slot always take the same path
         * through the same re-roll sequence, because `seen` is filled in date order from the
         * first month of the corpus every time it is built.
         */
        const key = canonicalDefinition(puzzle)
        if (!seen.has(key)) {
            seen.add(key)
            return puzzle
        }
    }

    throw new Error(
        `no unused puzzle for ${date} ${slot.group} level ${slot.level} after ${MAX_REROLLS} `
        + `re-rolls; this slot's space of single-solution boards may be exhausted`)
}

/**
 * A puzzle's content, as bytes, with its name left out.
 *
 * Two puzzles with the same rocks and the same targets are the same puzzle however they are
 * labelled, and a daily game that serves one twice has repeated itself. The full definition
 * is compared rather than `definitionHash`, which is a 32-bit FNV value chosen to detect
 * change cheaply and will collide across tens of thousands of entries by birthday alone.
 */
export const canonicalDefinition = (puzzle: StoredPuzzle): string =>
    JSON.stringify([puzzle.board, puzzle.boardHorizontalNumbers, puzzle.boardVerticalNumbers])

/**
 * How many times a slot may be re-rolled before the build gives up.
 *
 * Generous: the observed collision rate was 314 in 32,877, almost all of them on the
 * roomiest easy board, and a re-roll draws from a different stream entirely. Needing more
 * than a handful would mean the slot's space is genuinely exhausted, which is a content
 * design problem and should be reported rather than papered over.
 */
export const MAX_REROLLS = 32

export const generateDay = (date: string, seen?: Set<string>): DayEntry => {
    const day: DayEntry = { date, easyBoards: [], mediumBoards: [], hardBoards: [] }
    for (const slot of SLOTS) day[slot.group].push(generateSlot(date, slot, { seen }))
    return day
}

/**
 * A month of days.
 *
 * `seen` is threaded through so that duplicate detection spans the whole corpus rather than
 * a single month. It must be filled in date order from the very first month for the result
 * to be reproducible, which is what `build-corpus.ts` does.
 */
export const generateChunk = (month: string, seen?: Set<string>): Chunk => ({
    month,
    version: CORPUS_VERSION,
    days: datesIn(month).map(date => generateDay(date, seen)),
})

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/** Minified, and with a trailing newline so the file is well-formed for tooling. */
export const encodeChunk = (chunk: Chunk): string => `${JSON.stringify(chunk)}\n`

export const sha256 = (text: string): string =>
    createHash('sha256').update(text, 'utf8').digest('hex')

/** The published filename: content-hashed, so a chunk can be cached indefinitely. */
export const chunkFileName = (month: string, digest: string): string =>
    `${month}.${digest.slice(0, 16)}.json`

export const chunkRefFor = (chunk: Chunk): ChunkRef => {
    const encoded = encodeChunk(chunk)
    const digest = sha256(encoded)
    return {
        month: chunk.month,
        file: chunkFileName(chunk.month, digest),
        sha256: digest,
        days: chunk.days.length,
        firstDate: chunk.days[0].date,
        lastDate: chunk.days[chunk.days.length - 1].date,
    }
}

export const manifestFor = (chunks: Chunk[], generatedAt: string): Manifest => {
    const refs = chunks.map(chunkRefFor)
    return {
        version: CORPUS_VERSION,
        seed: CORPUS_SEED,
        generatedAt,
        firstDate: refs[0].firstDate,
        lastDate: refs[refs.length - 1].lastDate,
        days: refs.reduce((total, ref) => total + ref.days, 0),
        puzzles: refs.reduce((total, ref) => total + ref.days, 0) * SLOTS.length,
        chunks: refs,
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type Problem = string

/**
 * Everything that must be true of a corpus before it may replace what is committed.
 *
 * Returns every problem rather than the first, because a build that fails should say what is
 * wrong with it once.
 */
export const validateCorpus = (manifest: Manifest, chunks: Chunk[]): Problem[] => {
    const problems: Problem[] = []
    const say = (problem: Problem) => problems.push(problem)

    if (manifest.version !== CORPUS_VERSION) say(`manifest version ${manifest.version} is not ${CORPUS_VERSION}`)
    if (manifest.seed !== CORPUS_SEED) say(`manifest seed ${manifest.seed} is not ${CORPUS_SEED}`)
    if (manifest.chunks.length !== chunks.length) say(`manifest lists ${manifest.chunks.length} chunks but ${chunks.length} were supplied`)
    if (chunks.length === 0) { say('a corpus with no chunks is not a corpus'); return problems }

    if (chunks[0].month !== CORPUS_START_MONTH)
        say(`the corpus starts at ${chunks[0].month}, but ${CORPUS_START_MONTH} is fixed`)

    const seenIds = new Set<string>()
    let expectedDate: string | null = null

    chunks.forEach((chunk, index) => {
        const ref = manifest.chunks[index]
        if (!ref) return

        /*
         * Every field of the ref is compared against one derived from the chunk itself,
         * rather than only the hash. `days`, `firstDate`, `lastDate` and `file` used to be
         * taken on trust, which meant the manifest could describe a corpus that the chunks
         * did not contain -- and the horizon guard reads exactly those fields.
         */
        const derived = chunkRefFor(chunk)
        if (ref.month !== chunk.month) say(`manifest chunk ${index} is ${ref.month} but the chunk says ${chunk.month}`)
        if (ref.sha256 !== derived.sha256) say(`${chunk.month}: content does not match its manifest hash`)
        if (ref.file !== derived.file) say(`${chunk.month}: is published as ${ref.file}, but its content names it ${derived.file}`)
        if (ref.days !== derived.days) say(`${chunk.month}: manifest says ${ref.days} days, the chunk holds ${derived.days}`)
        if (ref.firstDate !== derived.firstDate) say(`${chunk.month}: manifest says it starts ${ref.firstDate}, the chunk starts ${derived.firstDate}`)
        if (ref.lastDate !== derived.lastDate) say(`${chunk.month}: manifest says it ends ${ref.lastDate}, the chunk ends ${derived.lastDate}`)
        if (chunk.version !== CORPUS_VERSION) say(`${chunk.month}: chunk version ${chunk.version} is not ${CORPUS_VERSION}`)

        // Months run consecutively: a gap would be a month of blank days in the calendar.
        if (index > 0 && chunk.month !== addMonths(chunks[index - 1].month, 1))
            say(`${chunk.month} does not follow ${chunks[index - 1].month}`)

        const expectedDays = datesIn(chunk.month)
        if (chunk.days.length !== expectedDays.length)
            say(`${chunk.month}: has ${chunk.days.length} days, expected ${expectedDays.length}`)

        chunk.days.forEach((day, dayIndex) => {
            if (day.date !== expectedDays[dayIndex])
                say(`${chunk.month}: day ${dayIndex} is ${day.date}, expected ${expectedDays[dayIndex]}`)
            // Contiguity across the whole corpus, not only within a chunk.
            if (expectedDate !== null && day.date !== expectedDate)
                say(`${day.date} follows a gap; expected ${expectedDate}`)
            expectedDate = addDays(day.date, 1)

            /*
             * Walk the arrays the chunk actually holds, rather than looking up the ids that
             * ought to be there. Looking up by expected id was the first version of this and
             * it left an opening a validator has no business leaving: an *extra* entry in a
             * group was never examined at all, so a duplicated or entirely bogus puzzle sat
             * in a chunk and every check passed. It also made the duplicate-id branch below
             * unreachable, since each expected id was only ever looked up once.
             */
            for (const group of GROUPS) {
                const levels = SLOTS.filter(slot => slot.group === group)
                const puzzles = day[group]

                if (puzzles.length !== levels.length) {
                    say(`${day.date}: ${group} has ${puzzles.length} boards, expected ${levels.length}`)
                }

                puzzles.forEach((puzzle, position) => {
                    const slot = levels[position]
                    if (!slot) {
                        say(`${day.date}: ${group} has an extra board ${puzzle.puzzleId}`)
                        return
                    }
                    const expected = puzzleIdFor(day.date, group, slot.level)
                    if (puzzle.puzzleId !== expected)
                        say(`${day.date}: ${group}[${position}] is ${puzzle.puzzleId}, expected ${expected}`)
                    if (seenIds.has(puzzle.puzzleId)) say(`duplicate puzzleId ${puzzle.puzzleId}`)
                    seenIds.add(puzzle.puzzleId)

                    if (puzzle.board.length !== slot.size)
                        say(`${puzzle.puzzleId}: board is ${puzzle.board.length} wide, expected ${slot.size}`)
                    const rocks = puzzle.board.flat().filter(cell => cell === -1).length
                    if (rocks !== slot.rocks)
                        say(`${puzzle.puzzleId}: has ${rocks} rocks, expected ${slot.rocks}`)
                })
            }
        })
    })

    if (manifest.firstDate !== chunks[0].days[0].date) say('manifest firstDate disagrees with the first chunk')
    if (manifest.lastDate !== lastDateOf(chunks))
        say(`manifest lastDate is ${manifest.lastDate}, but the chunks end ${lastDateOf(chunks)}`)

    const actualDays = chunks.reduce((total, chunk) => total + chunk.days.length, 0)
    if (manifest.days !== actualDays) say(`manifest claims ${manifest.days} days, found ${actualDays}`)
    if (manifest.puzzles !== seenIds.size) say(`manifest claims ${manifest.puzzles} puzzles, found ${seenIds.size}`)

    return problems
}

/**
 * Is every puzzle actually playable?
 *
 * The expensive half of validation, separated so a caller can report progress over a corpus
 * of thirty thousand. Nothing may be published that the production solver cannot prove has
 * exactly one answer — a board with two contradicts a player's correct reasoning, and one
 * with none cannot be finished at all.
 */
export const unsolvablePuzzles = (chunks: Chunk[], onDay?: (date: string) => void): Problem[] => {
    const problems: Problem[] = []
    for (const chunk of chunks) {
        for (const day of chunk.days) {
            onDay?.(day.date)
            // `GROUPS`, not `SLOTS`. Iterating the nine slots and then the whole group each
            // time walked every group three times over: 98,631 solver calls for a corpus of
            // 32,877 puzzles, while the progress line said 32,877. The answer was right and
            // the work was triple.
            for (const group of GROUPS) {
                for (const puzzle of day[group]) {
                    const result = solve(definitionFrom(puzzle))
                    if (result.kind !== 'solved') {
                        problems.push(`${puzzle.puzzleId}: solver says ${result.kind}`)
                    }
                }
            }
        }
    }
    return problems
}

/**
 * Definitions that appear more than once anywhere in the corpus.
 *
 * Structural validation can say every puzzle is well-formed and uniquely solvable while the
 * corpus still repeats itself, which is what happened: the first build had 314 exact
 * repeats. This is the check that would have caught it.
 */
export const duplicateDefinitions = (chunks: Chunk[]): Problem[] => {
    const firstSeen = new Map<string, string>()
    const problems: Problem[] = []
    for (const chunk of chunks) {
        for (const day of chunk.days) {
            for (const group of GROUPS) {
                for (const puzzle of day[group]) {
                    const key = canonicalDefinition(puzzle)
                    const earlier = firstSeen.get(key)
                    if (earlier) problems.push(`${puzzle.puzzleId} repeats ${earlier}`)
                    else firstSeen.set(key, puzzle.puzzleId)
                }
            }
        }
    }
    return problems
}

/** The last day the chunks actually contain, as opposed to what the manifest claims. */
export const lastDateOf = (chunks: Chunk[]): string | null => {
    const last = chunks[chunks.length - 1]
    if (!last || last.days.length === 0) return null
    return last.days[last.days.length - 1].date
}

/**
 * Does the new corpus keep every promise the committed one made?
 *
 * The append-only rule, and the only check here that compares against what is already
 * published. Every date the old index covered must still exist, with the same puzzle ids and
 * the same boards; new dates may only be added after the old last date.
 */
export const appendOnlyProblems = (
    previous: { manifest: Manifest, chunks: Chunk[] } | null,
    next: { manifest: Manifest, chunks: Chunk[] },
): Problem[] => {
    if (!previous) return []
    const problems: Problem[] = []

    if (previous.manifest.firstDate !== next.manifest.firstDate)
        problems.push(`the corpus used to start at ${previous.manifest.firstDate} and now starts at ${next.manifest.firstDate}`)
    if (monthsBetween(monthOf(previous.manifest.lastDate), monthOf(next.manifest.lastDate)) < 0)
        problems.push(`the corpus used to reach ${previous.manifest.lastDate} and now stops at ${next.manifest.lastDate}`)

    const after = new Map<string, DayEntry>()
    for (const chunk of next.chunks) for (const day of chunk.days) after.set(day.date, day)

    for (const chunk of previous.chunks) {
        for (const day of chunk.days) {
            const now = after.get(day.date)
            if (!now) { problems.push(`${day.date} was published and is now missing`); continue }
            // Byte comparison rather than a spot check: a changed rock is a changed puzzle,
            // and a player's saved progress is keyed on the definition hash of exactly this.
            if (JSON.stringify(now) !== JSON.stringify(day))
                problems.push(`${day.date} was published and its content has changed`)
        }
    }
    return problems
}

/**
 * How much runway is left, in whole months, measured from the last indexed date.
 *
 * Deliberately not a file count. Twelve chunks say nothing about whether the calendar has
 * already overtaken them.
 */
export const monthsRemaining = (manifest: Manifest, today: string): number =>
    monthsBetween(monthOf(today), monthOf(manifest.lastDate))
