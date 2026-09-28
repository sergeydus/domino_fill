import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LIMITS, MOTION, entryOffset, shakeKeyframes } from '@/app/dominoFill/motion'

/**
 * P1-6's motion limits, as the values state them (graphics spec, row 12).
 *
 * `e2e/motion.spec.ts` measures what the browser paints, frame by frame; this pins the
 * values it is painted from, and that nothing animates from anywhere else.
 */

describe('P1-6: the limits are the spec\'s', () => {
    it('a tenth and a bit of a cell, and a fifth of a second', () => {
        expect(LIMITS).toEqual({ amplitude: 0.12, duration: 0.2 })
    })
})

describe('P1-6: every motion is inside them', () => {
    for (const [name, motion] of Object.entries(MOTION)) {
        it(`${name}: runs no longer than ${LIMITS.duration}s`, () => {
            expect(motion.duration).toBeGreaterThan(0)
            expect(motion.duration).toBeLessThanOrEqual(LIMITS.duration)
        })
        const reach = 'offset' in motion ? motion.offset : 'amplitude' in motion ? motion.amplitude : 0
        it(`${name}: moves no further than ${LIMITS.amplitude} of a cell`, () => {
            expect(reach).toBeLessThanOrEqual(LIMITS.amplitude)
        })
    }

    it('the shake, in px at every size: out to its amplitude and no further, from rest to rest', () => {
        for (const size of [38, 53, 86, 106]) {
            const frames = shakeKeyframes(size)
            expect(frames[0]).toBe(0)
            expect(frames[frames.length - 1]).toBe(0)
            const furthest = Math.max(...frames.map(Math.abs))
            expect(furthest).toBeCloseTo(MOTION.shake.amplitude * size, 9)
            expect(furthest).toBeLessThanOrEqual(LIMITS.amplitude * size)
        }
    })

    it('the entry, in px at every size: its diagonal is its offset', () => {
        for (const size of [38, 53, 86, 106]) {
            const axis = entryOffset(size)
            expect(Math.hypot(axis, axis)).toBeCloseTo(MOTION.entry.offset * size, 9)
        }
    })
})

/** Every component source in the app, comments stripped. */
const sources = (dir = 'app'): { file: string, code: string }[] =>
    readdirSync(dir).flatMap(name => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return sources(path)
        if (!/\.tsx?$/.test(name)) return []
        return [{ file: path, code: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '') }]
    })

describe('P1-6: nothing animates from anywhere else', () => {
    const all = sources()

    it('sees the app: the files that do animate are among those read', () => {
        // A positive control: a scan that found no files would pass everything below.
        const animating = all.filter(({ code }) => /\banimate=|\.start\(/.test(code)).map(({ file }) => file)
        expect(animating.length).toBeGreaterThanOrEqual(4)
    })

    it('no duration is written anywhere but motion.ts', () => {
        const written = all
            .filter(({ file }) => !file.endsWith(join('dominoFill', 'motion.ts')))
            .filter(({ code }) => /\bduration\s*:\s*[\d.]/.test(code))
            .map(({ file }) => file)
        expect(written).toEqual([])
    })

    it('and no hover or press is animated by `motion`, which answers to no media query', () => {
        // `whileHover` latches on some touch screens and ignores `(pointer: fine)`; hover
        // and press are CSS states now (globals.css), held by e2e/controlStates.spec.ts.
        const gestures = all.filter(({ code }) => /\bwhile(Hover|Tap|Focus)\b/.test(code)).map(({ file }) => file)
        expect(gestures).toEqual([])
    })
})
