import { deflateSync } from 'node:zlib'
import { rgbBytes } from '../app/palette'
import { PIECE, UNIT } from '../app/dominoFill/Pieces/geometry'

/**
 * The app's icon, drawn rather than pasted (spec P2-2, row 20b).
 *
 * A manifest that names icons which do not exist is worse than no manifest: the install
 * prompt never appears and nothing says why. So the icons have to be real files, and real
 * binary files checked into a repository are the sort of thing nobody can review -- you
 * cannot read a PNG in a diff, and six months later nobody knows whether the 512 and the
 * 180 are even the same picture.
 *
 * This renders them from one description instead. The mark is a vertical domino in the
 * game's own palette, every icon is the same drawing at a different size, and
 * `tests/icons.test.ts` checks the committed files still match what this produces -- so an
 * icon cannot drift from its source, and regenerating is a one-line command rather than an
 * afternoon in an image editor.
 *
 * The PNG encoder is here because the alternative is a dependency, and a build-time image
 * library is a large thing to add for one domino.
 */

/**
 * The game's own colours, so the icon is recognisably this board and not a stock tile --
 * from the palette since graphics row 5, so they cannot drift from the board's again.
 *
 * They had: the pip was `#1a1a1a` here and `black` on every piece. The board's value won,
 * because the board is what a player looks at and the icon is a picture of it.
 *
 * Since P2-4 (row 16) the tile is the board's tile, layer for layer: a `tileFace` face over a
 * `tileSide` extrusion. Until then its whole body was `tileSide`, the extrusion colour, with
 * no face at all.
 */
const BACKGROUND = rgbBytes('ground')
const FACE = rgbBytes('tileFace')
const SIDE = rgbBytes('tileSide')
const OUTLINE = rgbBytes('pieceOutline')
const DIVIDER = rgbBytes('divider')
const PIP = rgbBytes('pip')

type Rgb = readonly number[]

/**
 * The fraction of an icon's half-width a maskable mark may occupy (spec row 20h).
 *
 * A maskable icon is cropped to whatever shape the launcher uses, and the only region the
 * manifest specification guarantees survives is a centred circle of radius 40%. The mark
 * at full size does not fit: its rounded corners reach 0.42 of the icon from the centre --
 * outside the circle, and liable to be clipped by a round launcher.
 *
 * 0.70 puts them at 0.29, inside the safe radius with room to spare, and
 * `tests/icons.test.ts` measures every painted pixel rather than trusting this arithmetic.
 */
export const MASKABLE_SCALE = 0.70

/**
 * How much of the icon's height the mark fills, outline to outline.
 *
 * 0.8 (graphics P2-4, row 16; it was 0.89). The board's pip is a smaller fraction of its piece
 * than the old icon's, so at 0.89 the pip no longer reached down to where
 * `tests/icons.test.ts` samples it -- 0.3 of the icon, every size alike -- and at 64px the
 * sampled pixel fell on the pip's anti-aliased edge. At 0.8 the pip is centred at 0.284, and
 * that pixel is inside it at every size; the corners still reach past the 40% a maskable
 * icon must keep inside, which is what makes the ordinary icon a different file.
 */
export const MARK_HEIGHT = 0.8

/*
 * The board's upright domino (`DominoPieceOne`), in the board's own units (`Pieces/geometry.ts`):
 * one cell of `UNIT` wide, two tall, with its extrusion below. The outline weight, the corner
 * radius, the pip, the divider's span and weight and the extrusion are `PIECE`'s, so the icon
 * changes when those constants do.
 *
 * The rest is this file's own copy of `DominoPieceOne.tsx`, not a rendering of it: the pip at
 * the centre of the top cell, the divider on the line between the cells, and the order of the
 * layers. A change to any of those in the component would not reach the icon, and no test
 * compares them (P2-4's amendment says so).
 */
const { outline: O, radius: R, inset: I, extrusion: E, pipRadius, dividerInset, dividerWidth } = PIECE

/** The box the outline's stroke covers: the piece's own box, and half the stroke outside it. */
const BOX = { left: I - O / 2, top: I - O / 2, right: UNIT - I + O / 2, bottom: 2 * UNIT - I + E + O / 2 }

/** The mark's size in units, outline to outline. */
export const MARK = { width: BOX.right - BOX.left, height: BOX.bottom - BOX.top }

/** Whether (u, v) is inside the rounded rectangle from (x0, y0) to (x1, y1), corner radius r. */
const inRounded = (u: number, v: number, x0: number, y0: number, x1: number, y1: number, r: number) => {
    if (u < x0 || u > x1 || v < y0 || v > y1) return false
    const cx = Math.min(Math.max(u, x0 + r), x1 - r)
    const cy = Math.min(Math.max(v, y0 + r), y1 - r)
    return (u - cx) ** 2 + (v - cy) ** 2 <= r * r
}

/**
 * The domino's colour at a point of the drawing, in units, layered as the board layers it:
 * the side, the face over it, the outline -- a stroke `O` wide, centred on the edge of the
 * face and side together, so its outer corners are `R + O/2` round and its inner `R - O/2` --
 * and the divider and the pip on top.
 */
const paint = (u: number, v: number): Rgb => {
    if (!inRounded(u, v, BOX.left, BOX.top, BOX.right, BOX.bottom, R + O / 2)) return BACKGROUND
    if (!inRounded(u, v, I + O / 2, I + O / 2, UNIT - I - O / 2, 2 * UNIT - I + E - O / 2, R - O / 2)) return OUTLINE
    if (Math.abs(v - UNIT) <= dividerWidth / 2 && u >= dividerInset && u <= UNIT - dividerInset) return DIVIDER
    if ((u - UNIT / 2) ** 2 + (v - UNIT / 2) ** 2 <= pipRadius ** 2) return PIP
    if (inRounded(u, v, I, I, UNIT - I, 2 * UNIT - I, R)) return FACE
    return SIDE
}

/**
 * Samples per pixel, in each direction. The board is drawn by a browser, anti-aliased; the
 * icon's rounded corners and round pip, drawn at one sample, were stair-stepped at 512px.
 * Sixteen samples averaged is the same edge, and still a pure function of the size.
 */
const SAMPLES = 4

/**
 * The domino, upright and centred, at `size` px: the mark `MARK_HEIGHT` of the icon tall.
 *
 * `scale` shrinks the mark without moving it, so a maskable icon is the same drawing with
 * more ground around it rather than a second picture that can drift from this one.
 */
const draw = (size: number, scale = 1): Uint8Array => {
    const pixels = new Uint8Array(size * size * 4)
    // Pixels per unit, and the mark's centre, which sits on the icon's.
    const k = size * MARK_HEIGHT * scale / MARK.height
    const cu = (BOX.left + BOX.right) / 2
    const cv = (BOX.top + BOX.bottom) / 2
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Three running sums, not a `[0, 0, 0]`: the palette audit reads a byte triple as
            // a colour, and would be right to about anything that looked like one.
            let red = 0, green = 0, blue = 0
            for (let j = 0; j < SAMPLES; j++) {
                for (let i = 0; i < SAMPLES; i++) {
                    const u = cu + (x + (i + 0.5) / SAMPLES - size / 2) / k
                    const v = cv + (y + (j + 0.5) / SAMPLES - size / 2) / k
                    const [r, g, b] = paint(u, v)
                    red += r
                    green += g
                    blue += b
                }
            }
            const at = (y * size + x) * 4
            const n = SAMPLES * SAMPLES
            pixels[at] = Math.round(red / n)
            pixels[at + 1] = Math.round(green / n)
            pixels[at + 2] = Math.round(blue / n)
            pixels[at + 3] = 255
        }
    }
    return pixels
}

// ---- a minimal PNG encoder ----------------------------------------------------------

const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
    }
    return table
})()

const crc32 = (bytes: Uint8Array): number => {
    let c = 0xffffffff
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Uint8Array): Buffer => {
    const name = Buffer.from(type, 'ascii')
    const body = Buffer.concat([name, Buffer.from(data)])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
}

/**
 * A PNG of the icon at `size`, as bytes. Deterministic: same arguments, same file.
 *
 * `maskable` draws the same mark smaller, so all of it survives a launcher's crop.
 */
export const renderIcon = (size: number, { maskable = false } = {}): Buffer => {
    const pixels = draw(size, maskable ? MASKABLE_SCALE : 1)

    // Every scanline is prefixed with filter type 0 ("none"). Filtering would compress
    // better; a few flat tones and their edges compress well enough that it is not worth
    // the code.
    const raw = Buffer.alloc(size * (size * 4 + 1))
    for (let y = 0; y < size; y++) {
        raw[y * (size * 4 + 1)] = 0
        Buffer.from(pixels.buffer, y * size * 4, size * 4)
            .copy(raw, y * (size * 4 + 1) + 1)
    }

    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(size, 0)
    ihdr.writeUInt32BE(size, 4)
    ihdr[8] = 8      // bit depth
    ihdr[9] = 6      // colour type: RGBA
    ihdr[10] = 0     // deflate
    ihdr[11] = 0     // adaptive filtering
    ihdr[12] = 0     // no interlace

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', new Uint8Array()),
    ])
}

/** Where each size is written, and what needs it. */
export const ICONS: ReadonlyArray<
    { path: string, size: number, why: string, maskable?: boolean }
> = [
    { path: 'public/icon-192.png', size: 192, why: 'the manifest; the minimum Chrome installs from' },
    { path: 'public/icon-512.png', size: 512, why: 'the manifest; splash screens and store listings' },
    {
        path: 'public/icon-512-maskable.png',
        size: 512,
        maskable: true,
        // A separate file, because it is a different drawing. Row 20b declared the icon
        // above as `maskable` as well, which was wrong: an Android launcher crops to its
        // own shape, and this mark's corners lie outside the guaranteed safe circle.
        why: 'the manifest; Android crops it to the launcher shape',
    },
    { path: 'app/apple-icon.png', size: 180, why: 'iOS home screen; Safari ignores the manifest here' },
]
