import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { ArgumentError, parseArgs } from '@/scripts/args'

/**
 * Command lines for the corpus scripts (spec P1-6, row 18c).
 *
 * Each script used to find its options with `process.argv.indexOf('--out')` and take
 * whatever sat next to it, which is permissive in ways that all end badly. The one that
 * actually happened: `--out ""` passed every check, generated a full corpus, and then died
 * on `mkdir ''` -- after several seconds of work, in a script whose entire shape is
 * "validate everything before writing anything".
 */

describe('parsing a command line', () => {
    it('reads the options that were given', () => {
        expect(parseArgs(['--months', '3', '--out', 'tmp/x'], ['months', 'out']))
            .toEqual({ months: '3', out: 'tmp/x' })
    })

    it('returns nothing for an empty command line, so callers can apply defaults', () => {
        expect(parseArgs([], ['months', 'out'])).toEqual({})
    })

    it('tells "not supplied" apart from "supplied as something"', () => {
        // The distinction the old `?? ''` collapsed, and the reason the parser returns only
        // what was actually present rather than filling in blanks.
        expect('out' in parseArgs(['--months', '3'], ['months', 'out'])).toBe(false)
    })

    it('rejects an empty value', () => {
        expect(() => parseArgs(['--out', ''], ['out'])).toThrow(ArgumentError)
        expect(() => parseArgs(['--out', ''], ['out'])).toThrow(/needs a value, got ""/)
    })

    it('rejects a value that is only whitespace', () => {
        expect(() => parseArgs(['--out', '   '], ['out'])).toThrow(/needs a value/)
    })

    it('rejects a missing value at the end of the line', () => {
        expect(() => parseArgs(['--months'], ['months'])).toThrow(/--months needs a value/)
    })

    it('rejects another option used as a value', () => {
        // `--out --months 3` used to write the corpus to a directory called "--months".
        expect(() => parseArgs(['--out', '--months', '3'], ['months', 'out']))
            .toThrow(/--out needs a value, but is followed by --months/)
    })

    it('rejects an unknown option instead of ignoring it', () => {
        // `--monts 3` matched nothing and quietly ran the default 120-month build.
        expect(() => parseArgs(['--monts', '3'], ['months', 'out']))
            .toThrow(/unknown option --monts/)
    })

    it('names the options that would have worked', () => {
        expect(() => parseArgs(['--monts', '3'], ['months', 'out']))
            .toThrow(/Expected --months, --out, each followed by a value/)
    })

    it('rejects a bare argument', () => {
        expect(() => parseArgs(['3'], ['months'])).toThrow(/unexpected argument "3"/)
    })

    it('rejects a repeated option rather than silently taking the first', () => {
        expect(() => parseArgs(['--out', 'a', '--out', 'b'], ['out']))
            .toThrow(/--out was given more than once/)
    })

    it('accepts a value that merely starts with a single dash', () => {
        // So a negative number still reaches the option's own validation and gets its own
        // message, rather than being misreported as a missing value.
        expect(parseArgs(['--months', '-3'], ['months'])).toEqual({ months: '-3' })
    })
})

describe('the build script checks its arguments before it generates anything', () => {
    /*
     * The ordering assertion, run against the real entry point. The parser tests above
     * prove `--out ""` is rejected; this proves the rejection happens where it matters --
     * that nothing was generated first. One spawn, because the whole point is that the
     * script's own wiring is what puts the check in front of the work.
     */
    it('rejects --out "" without generating a corpus', () => {
        const run = spawnSync(
            process.execPath,
            [join('node_modules', 'tsx', 'dist', 'cli.mjs'), join('scripts', 'build-corpus.ts'),
                '--months', '1', '--out', ''],
            { encoding: 'utf8' })

        const output = `${run.stdout}${run.stderr}`
        expect(run.status).not.toBe(0)
        expect(output).toMatch(/--out needs a value/)
        // The old failure printed all of these first and then threw `mkdir ''`.
        expect(output).not.toMatch(/generated|structure ok|append-only/)
        expect(output).not.toMatch(/mkdir/)
        // And it arrives as a complaint, not a stack trace through args.ts, which is not
        // where the reader's mistake is.
        expect(output).not.toMatch(/^\s+at /m)
    }, 60_000)
})
