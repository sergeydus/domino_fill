import { deflateSync } from 'node:zlib'
import { rgbBytes } from '../app/palette'

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
 * library is a large thing to add for four flat rectangles.
 */

/**
 * The game's own colours, so the icon is recognisably this board and not a stock tile --
 * from the palette since graphics row 5, so they cannot drift from the board's again.
 *
 * They had: the pip was `#1a1a1a` here and `black` on every piece. The board's value won,
 * because the board is what a player looks at and the icon is a picture of it; the icons
 * were regenerated, and no page pixel moved.
 *
 * The tile's body is `tileSide`, the extrusion colour, not `tileFace`. That was already so,
 * is left alone here because this row moves no colour, and is P2-4's to reconsider along
 * with the rest of the drawing.
 */
const BACKGROUND = rgbBytes('ground')
const TILE = rgbBytes('tileSide')
const OUTLINE = rgbBytes('pieceOutline')
const DIVIDER = rgbBytes('divider')
const PIP = rgbBytes('pip')

type Rgb = readonly number[]

/**
 * The fraction of an icon's half-width a maskable mark may occupy (spec row 20h).
 *
 * A maskable icon is cropped to whatever shape the launcher uses, and the only region the
 * manifest specification guarantees survives is a centred circle of radius 40%. The mark
 * at full size does not fit: its outline spans 0.57 by 0.89 of the icon, so its own corners
 * sit 0.528 from the centre -- outside the circle, and liable to be clipped by a round
 * launcher.
 *
 * 0.70 puts them at 0.370, inside the safe radius with room to spare, and
 * `tests/icons.test.ts` measures every painted pixel rather than trusting this arithmetic.
 */
export const MASKABLE_SCALE = 0.70

/**
 * One domino, upright, centred, with a pip in the top half.
 *
 * Deliberately blunt shapes: an icon is rendered at 48 CSS px on a home screen, where fine
 * detail becomes mud. The pip is what makes it read as a domino rather than as a door.
 *
 * `scale` shrinks the mark without moving it, so a maskable icon is the same drawing with
 * more ground around it rather than a second picture that can drift from this one.
 */
const draw = (size: number, scale = 1): Uint8Array => {
    const pixels = new Uint8Array(size * size * 4)
    const put = (x: number, y: number, [r, g, b]: Rgb) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return
        const at = (y * size + x) * 4
        pixels[at] = r
        pixels[at + 1] = g
        pixels[at + 2] = b
        pixels[at + 3] = 255
    }
    const rect = (x0: number, y0: number, w: number, h: number, colour: Rgb) => {
        for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
            for (let x = Math.round(x0); x < Math.round(x0 + w); x++) put(x, y, colour)
        }
    }
    const disc = (cx: number, cy: number, r: number, colour: Rgb) => {
        for (let y = Math.round(cy - r); y <= cy + r; y++) {
            for (let x = Math.round(cx - r); x <= cx + r; x++) {
                if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, colour)
            }
        }
    }

    rect(0, 0, size, size, BACKGROUND)

    // Proportions as fractions of the icon, so every size is the same picture.
    const edge = size * 0.055 * scale
    const width = size * 0.46 * scale
    const height = size * 0.78 * scale
    const x = (size - width) / 2
    const y = (size - height) / 2

    rect(x - edge, y - edge, width + edge * 2, height + edge * 2, OUTLINE)
    rect(x, y, width, height, TILE)
    // The dividing bar: what separates the two halves of a domino.
    rect(x, y + height / 2 - edge / 2, width, edge, DIVIDER)
    // One pip in the top half. The top half is worth 1 in this game, which is the joke.
    disc(size / 2, y + height / 4, size * 0.075 * scale, PIP)

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
    // better; four flat rectangles compress well enough that it is not worth the code.
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
