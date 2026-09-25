/**
 * Read the drawing constants out of rendered piece markup (graphics spec P0-2, row 2).
 *
 * Shared by tests/pieceGeometry.test.tsx, which reads a server render of the piece layer,
 * and e2e/art.spec.ts, which reads the real board in the real build. One reader for both,
 * so that when the two disagree it is the art that differs and not the measuring.
 *
 * **Self-contained on purpose.** Playwright ships a function into the page by its source
 * text, so this may not close over anything: no imports, no module-level helpers. It takes
 * the root to search so the same code runs over a detached jsdom host and over `document`.
 *
 * **Every piece on the board, not a sample.** An earlier version read the first piece of each
 * kind, which pinned the shared components but said nothing about the other rocks on a live
 * board -- and "every instance on every piece" was claimed of it anyway. A constant is
 * one number only if every piece agrees on it, so all of them are read, and the counts come
 * back with the values so a caller can say how long each list must be: a piece that
 * stopped drawing a pip cannot pass by contributing nothing.
 *
 * **In CSS pixels, through the `viewBox` (row 6).** Since P0-6 a piece draws in its own
 * units and is scaled once by its outer `width`, so an attribute is no longer a pixel
 * length. Each value is read as attribute x scale, where the scale is the svg's `width`
 * over its `viewBox` width: what the drawing measures on screen, whatever units it is
 * written in.
 *
 * The entry offset is not here: it is an animation's starting frame rather than markup at
 * rest, and each suite has its own way to catch it.
 */
export const readArt = (root: ParentNode) => {
    const num = (el: Element | null, name: string) => {
        if (el === null) throw new Error(`no element to read ${name} from`)
        const raw = el.getAttribute(name)
        if (raw === null) throw new Error(`${el.tagName} has no ${name}`)
        return Number(raw)
    }
    /** CSS px per drawing unit, for the piece `el` holds. */
    const scaleOf = (el: Element) => {
        const svg = el.querySelector('svg')
        const box = svg?.getAttribute('viewBox')
        if (svg == null || box == null) throw new Error('a piece with no viewBox')
        return num(svg, 'width') / Number(box.trim().split(/[\s,]+/)[2])
    }
    const all = (kind: string) => {
        const found = Array.from(root.querySelectorAll(`[data-piece="${kind}"]`))
        if (found.length === 0) throw new Error(`no ${kind} on the board`)
        return found
    }
    const ones = all('one')
    const twos = all('two')
    const rocks = all('rock')
    const pieces = [...ones, ...twos, ...rocks]
    const px = (el: Element, value: number) => value * scaleOf(el)
    /** The lowest y a shape reaches, in drawing units: a rect's, or a polygon's points'. */
    const bottom = (el: Element | undefined) => {
        if (el === undefined) throw new Error('a piece with no side or no face')
        if (el.tagName.toLowerCase() === 'rect') return num(el, 'y') + num(el, 'height')
        const ys = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).filter((_, i) => i % 2 === 1).map(Number)
        if (ys.length === 0) throw new Error(`${el.tagName} has no points`)
        return Math.max(...ys)
    }

    return {
        counts: { ones: ones.length, twos: twos.length, rocks: rocks.length },
        outline: pieces.map(el => px(el, num(el.querySelector('[data-outline]'), 'stroke-width'))),
        radius: pieces.flatMap(el => Array.from(el.querySelectorAll('rect'), r => px(el, num(r, 'rx')))),
        pip: pieces.flatMap(el => Array.from(el.querySelectorAll('circle'), c => px(el, 2 * num(c, 'r')))),
        divider: [
            ...ones.map(el => px(el, num(el.querySelector('line'), 'x2') - num(el.querySelector('line'), 'x1'))),
            ...twos.map(el => px(el, num(el.querySelector('line'), 'y2') - num(el.querySelector('line'), 'y1'))),
        ],
        /*
         * The side, then the face: each piece draws its extruded side first, lower down,
         * and the face over it. Located by drawing order rather than by fill, because the
         * fills are P0-5's to turn into tokens and this should not break when they are.
         *
         * Measured bottom to bottom, which is how far the side shows below the face. For a
         * domino's two rects it is the same as top to top; the rock's side is its face
         * swept down (graphics row 8), whose top is the face's own, so only the bottoms
         * differ.
         */
        extrusion: pieces.map(el => {
            const [side, face] = Array.from(el.querySelectorAll(
                'rect:not([data-outline]), polygon:not([data-outline])'))
            return px(el, bottom(side) - bottom(face))
        }),
        /*
         * How far each piece is lifted out of its cell -- the other half of the extrusion,
         * and a CSS length rather than a drawing one, so read from the svg's `translate`.
         * It was a fixed `-translate-y-4` class before row 6 and is inline since. Read from
         * the attribute, which both a server render (`translate:0 -16px`) and the browser
         * (`translate: 0px -16px;`) write, rather than from `style.translate`, which jsdom
         * does not know.
         */
        lift: pieces.map(el => {
            const style = el.querySelector('svg')?.getAttribute('style') ?? ''
            const y = /translate:\s*0(?:px)?\s+(-?[\d.e+-]+)px/.exec(style)
            if (y === null) throw new Error(`no lift in style "${style}"`)
            return -Number(y[1])
        }),
    }
}

export type Art = ReturnType<typeof readArt>
