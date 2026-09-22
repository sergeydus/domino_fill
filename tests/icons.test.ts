import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { ICONS, renderIcon } from '@/scripts/icon'

/**
 * The icons are a pure function of their generator (spec P2-2, row 20b).
 *
 * A checked-in binary is the one kind of file nobody reviews: it cannot be read in a diff,
 * and there is no way to tell from the repository whether the 512 and the 180 are even the
 * same picture. Generating them removes the question, and this is what keeps the answer
 * true -- edit the drawing without regenerating, or hand-edit a PNG, and these fail.
 */

describe('every committed icon matches what the generator produces', () => {
    for (const { path, size } of ICONS) {
        it(`${path} is the drawing at ${size}px`, () => {
            expect(readFileSync(path).equals(renderIcon(size))).toBe(true)
        })
    }
})

describe('and they are PNGs a browser will accept', () => {
    /*
     * Encoded by hand, because a build-time image library is a large dependency for four
     * flat rectangles -- so the header it writes is worth checking rather than assuming.
     * A manifest naming an icon that fails to decode gives no install prompt and no error.
     */
    const parse = (bytes: Buffer) => ({
        signature: [...bytes.subarray(0, 8)],
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        bitDepth: bytes[24],
        colourType: bytes[25],
        firstChunk: bytes.subarray(12, 16).toString('ascii'),
        lastChunk: bytes.subarray(bytes.length - 8, bytes.length - 4).toString('ascii'),
    })

    it('declares the size it was asked for', () => {
        for (const { size } of ICONS) {
            const png = parse(renderIcon(size))
            expect(png.signature).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
            expect([png.width, png.height]).toEqual([size, size])
            expect(png.bitDepth).toBe(8)
            expect(png.colourType).toBe(6)      // RGBA
            expect(png.firstChunk).toBe('IHDR')
            expect(png.lastChunk).toBe('IEND')
        }
    })

    it('is byte-identical when rendered twice', () => {
        // Anything non-deterministic here -- a timestamp chunk, a map iteration order --
        // would make every regeneration a spurious diff and the check above meaningless.
        expect(renderIcon(64).equals(renderIcon(64))).toBe(true)
    })

    it('is the same drawing at every size, not three different ones', () => {
        /*
         * The proportions are fractions of the icon for this reason. Compared by sampling
         * the same relative points rather than by scaling pixels: the centre of the top
         * half holds the pip, the centre of the bottom half is bare tile, and the corner
         * is background, at 64px and at 512px alike.
         */
        const colours = (size: number) => {
            const png = renderIcon(size)
            const at = (fx: number, fy: number) =>
                sample(png, size, Math.floor(size * fx), Math.floor(size * fy))
            return [at(0.02, 0.02), at(0.5, 0.3), at(0.5, 0.7)]
        }
        expect(colours(512)).toEqual(colours(64))
        // And the three points are genuinely different, or the comparison proves nothing.
        expect(new Set(colours(512)).size).toBe(3)
    })
})

/** Decode one pixel out of a PNG this module wrote, to compare drawings across sizes. */
const sample = (png: Buffer, size: number, x: number, y: number): string => {
    const chunks: Buffer[] = []
    let at = 8
    while (at < png.length) {
        const length = png.readUInt32BE(at)
        const type = png.subarray(at + 4, at + 8).toString('ascii')
        if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length))
        at += length + 12
    }
    const raw = inflateSync(Buffer.concat(chunks))
    const stride = size * 4 + 1
    const offset = y * stride + 1 + x * 4
    return [...raw.subarray(offset, offset + 3)].join(',')
}
