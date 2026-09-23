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
    const all = (kind: string) => {
        const found = Array.from(root.querySelectorAll(`[data-piece="${kind}"]`))
        if (found.length === 0) throw new Error(`no ${kind} on the board`)
        return found
    }
    const ones = all('one')
    const twos = all('two')
    const rocks = all('rock')
    const pieces = [...ones, ...twos, ...rocks]

    return {
        counts: { ones: ones.length, twos: twos.length, rocks: rocks.length },
        outline: pieces.map(el => num(el.querySelector('[data-outline]'), 'stroke-width')),
        radius: pieces.flatMap(el => Array.from(el.querySelectorAll('rect'), r => num(r, 'rx'))),
        pip: pieces.flatMap(el => Array.from(el.querySelectorAll('circle'), c => 2 * num(c, 'r'))),
        divider: [
            ...ones.map(el => num(el.querySelector('line'), 'x2') - num(el.querySelector('line'), 'x1')),
            ...twos.map(el => num(el.querySelector('line'), 'y2') - num(el.querySelector('line'), 'y1')),
        ],
        /*
         * The side, then the face: each piece draws its extruded side first, lower down,
         * and the face over it. Located by drawing order rather than by fill, because the
         * fills are P0-5's to turn into tokens and this should not break when they are.
         */
        extrusion: pieces.map(el => {
            const [side, face] = Array.from(el.querySelectorAll('rect:not([data-outline])'))
            return num(side, 'y') - num(face, 'y')
        }),
    }
}

export type Art = ReturnType<typeof readArt>
