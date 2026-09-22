import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { ICONS, MASKABLE_SCALE, renderIcon } from '@/scripts/icon'
import manifest from '@/app/manifest'

/**
 * The icons are a pure function of their generator (spec P2-2, row 20b).
 *
 * A checked-in binary is the one kind of file nobody reviews: it cannot be read in a diff,
 * and there is no way to tell from the repository whether the 512 and the 180 are even the
 * same picture. Generating them removes the question, and this is what keeps the answer
 * true -- edit the drawing without regenerating, or hand-edit a PNG, and these fail.
 */

describe('every committed icon matches what the generator produces', () => {
    for (const { path, size, maskable } of ICONS) {
        it(`${path} is the drawing at ${size}px${maskable ? ', masked' : ''}`, () => {
            expect(readFileSync(path).equals(renderIcon(size, { maskable }))).toBe(true)
        })
    }
})

describe('the maskable icon survives a launcher crop', () => {
    /*
     * Row 20b declared the ordinary 512 icon as `maskable` too, with a comment claiming it
     * had "enough margin around the domino to survive" the crop. It did not, and nothing
     * here measured it -- which is the whole reason this row exists.
     *
     * An Android launcher crops a maskable icon to its own shape; the manifest
     * specification guarantees only a centred circle of radius 40% of the icon. So the
     * test is not "is there a separate file" but "does every painted pixel fall inside
     * that circle", measured on the bytes the manifest actually points at.
     */
    const SAFE_RADIUS = 0.4

    /** How far the furthest non-background pixel sits from the centre, as a fraction. */
    const markReach = (size: number, options: { maskable?: boolean }): number => {
        const raw = scanlines(renderIcon(size, options), size)
        const centre = (size - 1) / 2
        let furthest = 0
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const at = y * (size * 4 + 1) + 1 + x * 4
                const isBackground = raw[at] === 0xe8 && raw[at + 1] === 0xe7 && raw[at + 2] === 0xe7
                if (isBackground) continue
                const distance = Math.hypot(x - centre, y - centre) / size
                if (distance > furthest) furthest = distance
            }
        }
        return furthest
    }

    it('keeps the whole mark inside the guaranteed safe circle', () => {
        expect(markReach(512, { maskable: true })).toBeLessThan(SAFE_RADIUS)
    })

    it('and the manifest points at that file, not the full-bleed one', () => {
        // The pairing is the thing that broke: the right declaration on the wrong bytes.
        const declared = ICONS.find(icon => icon.maskable)
        expect(declared?.path).toBe('public/icon-512-maskable.png')
        expect(manifest().icons?.find(icon => icon.purpose === 'maskable')?.src)
            .toBe('/icon-512-maskable.png')
    })

    it('which the ordinary icon does not, or there would be no second file', () => {
        /*
         * The check above proves nothing on its own unless this fails -- a mark small
         * enough for a crop would make both files identical and the whole row pointless.
         * The ordinary icon fills its frame on purpose: it is shown uncropped, where
         * margin is wasted space.
         */
        expect(markReach(512, {})).toBeGreaterThan(SAFE_RADIUS)
    })

    it('is the same drawing, only smaller', () => {
        // Not a second picture that can drift: the mark is scaled, the ground is not, so
        // the reach shrinks by exactly the scale factor.
        const ratio = markReach(512, { maskable: true }) / markReach(512, {})
        expect(ratio).toBeCloseTo(MASKABLE_SCALE, 2)
    })
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

/**
 * The decoded scanlines of a PNG this module wrote: filter byte, then RGBA per pixel.
 *
 * Only correct for these files, which is the point of keeping it here -- it assumes filter
 * type 0 on every row, which is what the encoder writes and nothing else needs to be true.
 */
const scanlines = (png: Buffer, size: number): Buffer => {
    const chunks: Buffer[] = []
    let at = 8
    while (at < png.length) {
        const length = png.readUInt32BE(at)
        const type = png.subarray(at + 4, at + 8).toString('ascii')
        if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length))
        at += length + 12
    }
    const raw = inflateSync(Buffer.concat(chunks))
    for (let y = 0; y < size; y++) {
        expect(raw[y * (size * 4 + 1)], `row ${y} is filtered`).toBe(0)
    }
    return raw
}

/** Decode one pixel out of a PNG this module wrote, to compare drawings across sizes. */
const sample = (png: Buffer, size: number, x: number, y: number): string => {
    const raw = scanlines(png, size)
    const offset = y * (size * 4 + 1) + 1 + x * 4
    return [...raw.subarray(offset, offset + 3)].join(',')
}
