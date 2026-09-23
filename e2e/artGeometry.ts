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
 * Lists, not single values. A constant is one number only if every piece agrees on it, and
 * the one-in-three case -- the rock's outline changed and the dominoes' did not -- is the
 * drift this exists to catch. Callers check the lengths too, so a piece that stopped
 * drawing a pip cannot pass by contributing nothing.
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
    const piece = (kind: string) => {
        const el = root.querySelector(`[data-piece="${kind}"]`)
        if (el === null) throw new Error(`no ${kind} on the board`)
        return el
    }
    const kinds = ['one', 'two', 'rock'].map(piece)
    const [upright, flat] = kinds.map(el => el.querySelector('line'))

    return {
        outline: kinds.map(el => num(el.querySelector('[data-outline]'), 'stroke-width')),
        // Every rect of the three sample pieces, not of the whole board: a real board has as
        // many rocks as the day's puzzle does, and the count has to be one this can state.
        radius: kinds.flatMap(el => Array.from(el.querySelectorAll('rect'), r => num(r, 'rx'))),
        pip: kinds.flatMap(el => Array.from(el.querySelectorAll('circle'), c => 2 * num(c, 'r'))),
        divider: [num(upright, 'x2') - num(upright, 'x1'), num(flat, 'y2') - num(flat, 'y1')],
        /*
         * The side, then the face: each piece draws its extruded side first, lower down,
         * and the face over it. Located by drawing order rather than by fill, because the
         * fills are P0-5's to turn into tokens and this should not break when they are.
         */
        extrusion: kinds.map(el => {
            const [side, face] = Array.from(el.querySelectorAll('rect:not([data-outline])'))
            return num(side, 'y') - num(face, 'y')
        }),
    }
}

export type Art = ReturnType<typeof readArt>
