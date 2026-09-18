import { describe, it, expect } from 'vitest'
import {
    CORPUS_SEED, CORPUS_START_MONTH, CORPUS_VERSION, HORIZON_WARNING_MONTHS, SLOTS,
    addMonths, appendOnlyProblems, chunkRefFor, datesIn, encodeChunk, generateDay,
    isoDate, manifestFor, monthOf, monthsBetween, monthsRemaining, parseDate,
    generateSlot, puzzleIdFor, rngFrom, seedFor, sha256, validateCorpus,
    type Chunk, type DayEntry, type Manifest,
} from '@/scripts/corpus'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { solve } from '@/app/stores/solver'

/**
 * The content pipeline's rules (spec P1-6, row 18c).
 *
 * Two properties carry the whole design, and both are the kind that fail silently.
 *
 * **Reproducible.** Every puzzle is a pure function of version, seed, date and slot, so a
 * rebuild produces the same bytes. Without it there is no way to tell a deliberate content
 * change from an accidental one, and every rebuild is a diff nobody can review.
 *
 * **Append-only.** A published date is a promise: saved progress, the archive, and the
 * player's memory of yesterday all point at it. Changing one is not a content update, it is
 * data loss.
 *
 * The full corpus is ~33,000 puzzles, far too many to solve on every unit run, so the
 * expensive sweep lives in `npm run corpus:verify` and this checks the rules plus a
 * deterministic sample.
 */

const emptyDay = (date: string): DayEntry =>
    ({ date, easyBoards: [], mediumBoards: [], hardBoards: [] })

/**
 * One real generated day, reused as the template for structural fixtures.
 *
 * Generating a month for real costs about five seconds, and the structural checks do not
 * care *which* puzzles a day holds — only that the slots, sizes, rock counts and ids line
 * up. So one day is generated properly and then re-dated, which keeps the fixtures honest
 * about shape while keeping the suite fast. The tests that do care about real generation
 * (reproducibility, solvability) use `generateDay` directly.
 */
const TEMPLATE = generateDay('2026-09-01')

/** A copy of the template, re-dated and re-identified as if it had been generated for `date`. */
const dayLike = (date: string): DayEntry => {
    const copy: DayEntry = JSON.parse(JSON.stringify(TEMPLATE))
    copy.date = date
    for (const slot of SLOTS) {
        copy[slot.group][slot.level - 1].puzzleId = puzzleIdFor(date, slot.group, slot.level)
    }
    return copy
}

/** A well-formed chunk, cheap enough to build a year of. */
const buildChunk = (month: string, days: string[]): Chunk => ({
    month, version: CORPUS_VERSION, days: days.map(dayLike),
})

describe('dates', () => {
    it('round-trips a real date and rejects one that only looks real', () => {
        expect(parseDate('2026-09-18')).toBe(Date.UTC(2026, 8, 18))
        // `Date.UTC` normalises these into other months rather than failing, which is why
        // the check is a round trip rather than a range test.
        for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', 'tomorrow', '2026-9-18', '']) {
            expect(parseDate(bad), bad).toBeNull()
        }
        // A leap day that is real stays real.
        expect(parseDate('2028-02-29')).not.toBeNull()
    })

    it('knows how long each month is, including February in a leap year', () => {
        expect(datesIn('2026-09')).toHaveLength(30)
        expect(datesIn('2026-10')).toHaveLength(31)
        expect(datesIn('2027-02')).toHaveLength(28)
        expect(datesIn('2028-02')).toHaveLength(29)
        expect(datesIn('2026-09')[0]).toBe('2026-09-01')
        expect(datesIn('2026-09')[29]).toBe('2026-09-30')
    })

    it('walks across a year boundary in both directions', () => {
        expect(addMonths('2026-12', 1)).toBe('2027-01')
        expect(addMonths('2027-01', -1)).toBe('2026-12')
        expect(addMonths('2026-09', 120)).toBe('2036-09')
        expect(monthsBetween('2026-09', '2036-08')).toBe(119)
        expect(monthsBetween('2036-08', '2026-09')).toBe(-119)
    })

    it('formats a timestamp as the day it belongs to', () => {
        expect(isoDate(Date.UTC(2026, 0, 1))).toBe('2026-01-01')
        expect(monthOf('2026-09-18')).toBe('2026-09')
    })
})

describe('reproducibility', () => {
    it('gives a date and slot the same seed every time', () => {
        expect(seedFor('2026-09-18', 'easyBoards', 1))
            .toBe(seedFor('2026-09-18', 'easyBoards', 1))
    })

    it('gives different seeds to neighbouring days and to sibling slots', () => {
        /*
         * Worth asserting rather than assuming. A seed built by adding its parts would give
         * the same value to (day 2, level 3) and (day 3, level 2), and the corpus would
         * quietly repeat puzzles on a diagonal.
         */
        const seeds = new Set<number>()
        for (const date of ['2026-09-17', '2026-09-18', '2026-09-19']) {
            for (const slot of SLOTS) seeds.add(seedFor(date, slot.group, slot.level))
        }
        expect(seeds.size).toBe(3 * SLOTS.length)
    })

    it('produces an identical day from an identical seed', () => {
        const first = generateDay('2026-09-18')
        const second = generateDay('2026-09-18')
        expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    })

    it('produces different days for different dates', () => {
        // The other half: deterministic is not the same as constant.
        expect(JSON.stringify(generateDay('2026-09-18').easyBoards[0].board))
            .not.toBe(JSON.stringify(generateDay('2026-09-19').easyBoards[0].board))
    })

    it('has an RNG that is stable and not stuck', () => {
        expect([...Array(3)].map(rngFrom(1))).toEqual([...Array(3)].map(rngFrom(1)))
        // xorshift has 0 as a fixed point, so a zero seed must be nudged off it or every
        // puzzle drawn from it would be the same board.
        const zero = rngFrom(0)
        const drawn = [zero(), zero(), zero()]
        expect(new Set(drawn).size).toBe(3)
        expect(drawn.every(value => value >= 0 && value < 1)).toBe(true)
    })
})

describe('identity', () => {
    it('names a puzzle after the date and slot it belongs to', () => {
        expect(puzzleIdFor('2026-09-18', 'easyBoards', 1)).toBe('v1-2026-09-18-easy-1')
        expect(puzzleIdFor('2026-09-18', 'hardBoards', 3)).toBe('v1-2026-09-18-hard-3')
    })

    it('is stable under regeneration, which a positional id was not', () => {
        /*
         * The old scheme was `v1-000-easy-1`: an index into the data file. Reordering or
         * inserting a day would have re-pointed every saved session after it. An id derived
         * from the date cannot be reordered.
         */
        const day = generateDay('2026-09-18')
        expect(day.easyBoards.map(p => p.puzzleId)).toEqual([
            'v1-2026-09-18-easy-1', 'v1-2026-09-18-easy-2', 'v1-2026-09-18-easy-3',
        ])
        expect(generateDay('2026-09-18').hardBoards[2].puzzleId).toBe(day.hardBoards[2].puzzleId)
    })

    it('gives every slot of a day a distinct id', () => {
        const day = generateDay('2026-09-18')
        const ids = [...day.easyBoards, ...day.mediumBoards, ...day.hardBoards].map(p => p.puzzleId)
        expect(new Set(ids).size).toBe(SLOTS.length)
    })
})

describe('a slot that cannot be filled', () => {
    it('throws, naming the day and slot, rather than shipping a short day', () => {
        /*
         * This has never happened for the configured slots, which is precisely why it is
         * tested on purpose: mutation-testing showed the guard could be deleted without a
         * single test noticing, because nothing ever asked for a slot that could fail.
         *
         * A day with eight puzzles would be a hole in the calendar that surfaced only when
         * a player reached it, possibly years later. `attempts: 0` forces the case.
         */
        expect(() => generateSlot('2026-09-18', SLOTS[0], 0))
            .toThrow(/no puzzle for 2026-09-18 easyBoards level 1 \(6x6, 8 rocks\)/)
    })

    it('fills the slot normally when it can', () => {
        const puzzle = generateSlot('2026-09-18', SLOTS[0])
        expect(puzzle.puzzleId).toBe('v1-2026-09-18-easy-1')
        expect(puzzle.board).toHaveLength(6)
    })
})

describe('a generated day', () => {
    const day = generateDay('2026-09-18')

    it('fills every slot at the size and rock count the slot asks for', () => {
        for (const slot of SLOTS) {
            const puzzle = day[slot.group].find(p => p.puzzleId.endsWith(`-${slot.level}`))!
            expect(puzzle.board).toHaveLength(slot.size)
            expect(puzzle.board.flat().filter(cell => cell === -1)).toHaveLength(slot.rocks)
        }
    })

    it('produces nine puzzles the production solver proves unique', () => {
        // The sample the unit suite can afford; `npm run corpus:verify` does all 33,000.
        for (const slot of SLOTS) {
            for (const puzzle of day[slot.group]) {
                const result = solve(definitionFrom(puzzle))
                expect(result.kind, puzzle.puzzleId).toBe('solved')
            }
        }
    })
})

describe('chunk integrity', () => {
    const chunk = buildChunk('2026-09', ['2026-09-01', '2026-09-02'])

    it('hashes the exact bytes that get written', () => {
        const ref = chunkRefFor(chunk)
        expect(ref.sha256).toBe(sha256(encodeChunk(chunk)))
        // The filename carries the hash, so a chunk can be cached forever and a changed
        // chunk is a different URL.
        expect(ref.file).toBe(`2026-09.${ref.sha256.slice(0, 16)}.json`)
    })

    it('changes the hash and the filename when a single cell changes', () => {
        const before = chunkRefFor(chunk)
        const tampered: Chunk = JSON.parse(JSON.stringify(chunk))
        tampered.days[0].easyBoards[0].boardHorizontalNumbers = '9,9,9,9,9,9'
        const after = chunkRefFor(tampered)

        expect(after.sha256).not.toBe(before.sha256)
        expect(after.file).not.toBe(before.file)
    })

    it('encodes minified, with a trailing newline', () => {
        const encoded = encodeChunk(chunk)
        expect(encoded.endsWith('\n')).toBe(true)
        expect(encoded).not.toContain('\n  ')   // no pretty-printing: the corpus is 12 MB
    })
})

describe('structural validation', () => {
    const goodChunks = [
        buildChunk('2026-09', datesIn('2026-09')),
    ]
    const goodManifest = manifestFor(goodChunks, '2026-09-18T00:00:00.000Z')

    it('accepts a corpus that is put together correctly', () => {
        expect(validateCorpus(goodManifest, goodChunks)).toEqual([])
        expect(goodManifest.days).toBe(30)
        expect(goodManifest.puzzles).toBe(30 * SLOTS.length)
    })

    it('rejects a manifest hash that does not match its chunk', () => {
        const chunks: Chunk[] = JSON.parse(JSON.stringify(goodChunks))
        chunks[0].days[3].mediumBoards[0].boardVerticalNumbers = 'tampered'
        expect(validateCorpus(goodManifest, chunks).join('; ')).toContain('does not match its manifest hash')
    })

    it('rejects a missing day', () => {
        const chunks: Chunk[] = JSON.parse(JSON.stringify(goodChunks))
        chunks[0].days.splice(10, 1)
        const manifest = manifestFor(chunks, '2026-09-18T00:00:00.000Z')
        const problems = validateCorpus(manifest, chunks).join('; ')
        expect(problems).toContain('has 29 days, expected 30')
    })

    it('rejects a gap between months', () => {
        const chunks = [buildChunk('2026-09', datesIn('2026-09')), buildChunk('2026-11', datesIn('2026-11'))]
        const manifest = manifestFor(chunks, '2026-09-18T00:00:00.000Z')
        const problems = validateCorpus(manifest, chunks).join('; ')
        expect(problems).toContain('2026-11 does not follow 2026-09')
        // And the day-level contiguity check catches the same hole from the other side.
        expect(problems).toContain('follows a gap')
    })

    it('rejects a corpus that does not start where the start month says', () => {
        const chunks = [buildChunk(addMonths(CORPUS_START_MONTH, 1), datesIn(addMonths(CORPUS_START_MONTH, 1)))]
        const manifest = manifestFor(chunks, '2026-09-18T00:00:00.000Z')
        expect(validateCorpus(manifest, chunks).join('; ')).toContain(`${CORPUS_START_MONTH} is fixed`)
    })

    it('rejects a puzzle whose id is not the one its slot should hold', () => {
        const chunks: Chunk[] = JSON.parse(JSON.stringify(goodChunks))
        chunks[0].days[5].easyBoards[1].puzzleId = chunks[0].days[5].easyBoards[0].puzzleId
        const problems = validateCorpus(manifestFor(chunks, 'x'), chunks).join('; ')
        expect(problems).toContain('easyBoards[1] is v1-2026-09-06-easy-1, expected v1-2026-09-06-easy-2')
        expect(problems).toContain('duplicate puzzleId v1-2026-09-06-easy-1')
    })

    it('rejects an extra board in a group', () => {
        /*
         * Found by mutation-testing, and it was a real hole rather than a missing test. The
         * validator used to look up the id each slot *should* hold; an extra entry was
         * therefore never examined at all, so a duplicated board -- or an entirely bogus one
         * -- could sit in a published chunk with every check passing. It also made the
         * duplicate-id branch unreachable, since each expected id was only looked up once.
         *
         * Measured before the fix: all three of these returned no problems whatsoever.
         */
        const duplicated: Chunk[] = JSON.parse(JSON.stringify(goodChunks))
        duplicated[0].days[0].easyBoards.push(
            JSON.parse(JSON.stringify(duplicated[0].days[0].easyBoards[0])))
        expect(validateCorpus(manifestFor(duplicated, 'x'), duplicated).join('; '))
            .toContain('easyBoards has 4 boards, expected 3')

        const bogus: Chunk[] = JSON.parse(JSON.stringify(goodChunks))
        const stranger = JSON.parse(JSON.stringify(bogus[0].days[0].hardBoards[0]))
        stranger.puzzleId = 'v1-not-a-real-id'
        bogus[0].days[0].hardBoards.push(stranger)
        expect(validateCorpus(manifestFor(bogus, 'x'), bogus).join('; '))
            .toContain('has an extra board v1-not-a-real-id')
    })

    it('rejects a group with a board missing', () => {
        const short: Chunk[] = JSON.parse(JSON.stringify(goodChunks))
        short[0].days[2].mediumBoards.pop()
        const problems = validateCorpus(manifestFor(short, 'x'), short).join('; ')
        expect(problems).toContain('mediumBoards has 2 boards, expected 3')
    })

    it('rejects a board with the wrong size or rock count for its slot', () => {
        const chunks: Chunk[] = JSON.parse(JSON.stringify(goodChunks))
        // Rock every cell, so the count is wrong regardless of what was there before.
        const board = chunks[0].days[0].hardBoards[0].board
        for (const row of board) row.fill(-1)
        const manifest = manifestFor(chunks, '2026-09-18T00:00:00.000Z')
        expect(validateCorpus(manifest, chunks).join('; ')).toMatch(/has 64 rocks, expected 10/)

        const short: Chunk[] = JSON.parse(JSON.stringify(goodChunks))
        short[0].days[0].hardBoards[0].board.pop()
        expect(validateCorpus(manifestFor(short, 'x'), short).join('; '))
            .toContain('board is 7 wide, expected 8')
    })

    it('rejects a manifest whose totals disagree with the chunks', () => {
        const manifest: Manifest = { ...goodManifest, puzzles: 1, days: 1, lastDate: '2099-01-01' }
        const problems = validateCorpus(manifest, goodChunks).join('; ')
        expect(problems).toContain('manifest lastDate disagrees')
        expect(problems).toContain('claims 1 puzzles')
    })

    it('rejects a seed or version that is not the committed one', () => {
        expect(validateCorpus({ ...goodManifest, seed: CORPUS_SEED + 1 }, goodChunks).join('; '))
            .toContain('manifest seed')
        expect(validateCorpus({ ...goodManifest, version: CORPUS_VERSION + 1 }, goodChunks).join('; '))
            .toContain('manifest version')
    })

    it('rejects an empty corpus rather than calling it valid', () => {
        expect(validateCorpus(manifestFor(goodChunks, 'x'), []).join('; '))
            .toContain('a corpus with no chunks')
    })
})

describe('append-only', () => {
    const published = [buildChunk('2026-09', ['2026-09-01', '2026-09-02'])]
    const before = { manifest: manifestFor(published, 'x'), chunks: published }

    it('allows a corpus that only adds later dates', () => {
        const extended = [
            published[0],
            { month: '2026-10', version: CORPUS_VERSION, days: ['2026-10-01'].map(generateDay) },
        ]
        expect(appendOnlyProblems(before, { manifest: manifestFor(extended, 'x'), chunks: extended }))
            .toEqual([])
    })

    it('allows the very first build, when nothing is published', () => {
        expect(appendOnlyProblems(null, before)).toEqual([])
    })

    it('refuses to change a published day', () => {
        const changed: Chunk[] = JSON.parse(JSON.stringify(published))
        // Flip a cell to whatever it is not. Writing `-1` unconditionally was the first
        // version of this and it passed vacuously whenever the cell was already a rock --
        // the tamper changed nothing, so of course nothing was reported.
        const cell = changed[0].days[1].easyBoards[0].board[0][0]
        changed[0].days[1].easyBoards[0].board[0][0] = cell === -1 ? null : -1

        const problems = appendOnlyProblems(before, { manifest: manifestFor(changed, 'x'), chunks: changed })
        expect(problems).toEqual(['2026-09-02 was published and its content has changed'])
    })

    it('refuses to drop a published day', () => {
        const shortened: Chunk[] = JSON.parse(JSON.stringify(published))
        shortened[0].days.pop()
        const problems = appendOnlyProblems(before, { manifest: manifestFor(shortened, 'x'), chunks: shortened })
        expect(problems.join('; ')).toContain('2026-09-02 was published and is now missing')
    })

    it('refuses to move the start of the corpus', () => {
        const later = [{ month: '2026-10', version: CORPUS_VERSION, days: ['2026-10-01'].map(generateDay) }]
        const problems = appendOnlyProblems(before, { manifest: manifestFor(later, 'x'), chunks: later })
        expect(problems.join('; ')).toContain('used to start at 2026-09-01')
    })

    it('notices a changed puzzle id even when the board is the same', () => {
        // Identity, not just content: progress is stored under the puzzleId.
        const renamed: Chunk[] = JSON.parse(JSON.stringify(published))
        renamed[0].days[0].easyBoards[0].puzzleId = 'v1-2026-09-01-easy-9'
        const problems = appendOnlyProblems(before, { manifest: manifestFor(renamed, 'x'), chunks: renamed })
        expect(problems.join('; ')).toContain('2026-09-01 was published and its content has changed')
    })
})

describe('the horizon guard', () => {
    const manifest = (lastDate: string): Manifest =>
        ({ ...manifestFor([buildChunk('2026-09', ['2026-09-01'])], 'x'), lastDate })

    it('measures from the last indexed date, not from a count of chunks', () => {
        /*
         * The distinction the spec insists on. A hundred and twenty chunks are ten years of
         * runway on the day they are built and none at all ten years later, so a file count
         * cannot answer the question. Same corpus, two different days, two different answers.
         */
        expect(monthsRemaining(manifest('2036-08-31'), '2026-09-18')).toBe(119)
        expect(monthsRemaining(manifest('2036-08-31'), '2035-09-18')).toBe(11)
        expect(monthsRemaining(manifest('2036-08-31'), '2037-01-01')).toBe(-5)
    })

    it('sits exactly on the boundary the guard uses', () => {
        // The guard fails below HORIZON_WARNING_MONTHS, so this is the last passing day.
        const lastGood = addMonths('2026-09', HORIZON_WARNING_MONTHS)
        expect(monthsRemaining(manifest(`${lastGood}-15`), '2026-09-18')).toBe(HORIZON_WARNING_MONTHS)
        expect(monthsRemaining(manifest(`${addMonths(lastGood, -1)}-15`), '2026-09-18'))
            .toBe(HORIZON_WARNING_MONTHS - 1)
    })

    it('counts whole months, so a date late in the month does not buy an extra one', () => {
        expect(monthsRemaining(manifest('2027-09-01'), '2026-09-30')).toBe(12)
        expect(monthsRemaining(manifest('2027-09-30'), '2026-09-01')).toBe(12)
    })
})

describe('the day entry a chunk carries', () => {
    it('is shaped the way the runtime already reads boards', () => {
        // 18d replaces the loader; keeping this shape is what makes that a loader change
        // rather than a rewrite of everything that consumes a board.
        const day = generateDay('2026-09-18')
        expect(Object.keys(emptyDay('x'))).toEqual(['date', 'easyBoards', 'mediumBoards', 'hardBoards'])
        expect(day.easyBoards).toHaveLength(3)
        expect(day.mediumBoards).toHaveLength(3)
        expect(day.hardBoards).toHaveLength(3)
        for (const puzzle of day.easyBoards) {
            expect(Object.keys(puzzle).sort())
                .toEqual(['board', 'boardHorizontalNumbers', 'boardVerticalNumbers', 'puzzleId'])
        }
    })
})
