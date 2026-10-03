import type { ControlMode } from "../stores/ControlStore"

/**
 * What the keys do on the board, per mode (keyboard polish, section 2 of its contract in
 * NEXT-STEPS).
 *
 * The rule changes between modes, and nothing said so: in the default mode Space selects a
 * square and an arrow places, and in Pick a piece mode Space places or removes at once. So
 * there are two texts per mode, for two readers:
 *
 *   - **the guide**, one visible line under the board while the keyboard is on it. Short,
 *     but never inaccurate: "Space, then an arrow", because the two are pressed in turn and
 *     "Space + arrow" reads as a chord (codex). The keys are `{ key }`, drawn in bold;
 *   - **the instructions**, the whole of it, for a screen reader: the grid's description.
 *     The guide is `aria-hidden`, and this is its equivalent.
 *
 * "Ctrl/Cmd+Z", because the board takes either (codex).
 */

export type GuidePart = string | { key: string }

export const KEY_GUIDE: Record<ControlMode, readonly GuidePart[]> = {
    drag: [{ key: 'Space' }, ', then an ', { key: 'arrow' }, ': place · ', { key: 'Delete' }, ': remove'],
    pick: [{ key: 'Space' }, ': place or remove · ', { key: 'Tab' }, ': piece picker'],
}

export const KEY_INSTRUCTIONS: Record<ControlMode, string> = {
    drag: 'Arrow keys move. Space or Enter selects a square, then an arrow key places a piece '
        + 'that way. Escape cancels. Delete removes a piece. Ctrl/Cmd+Z undoes.',
    pick: 'Arrow keys move. Space or Enter places the held piece, or removes a placed one. '
        + 'Delete removes a piece. Ctrl/Cmd+Z undoes. Tab goes to the piece picker, where an '
        + 'arrow key switches the piece; Shift+Tab comes back to the same square.',
}

/** The guide as plain text, as it reads. */
export const guideText = (mode: ControlMode): string =>
    KEY_GUIDE[mode].map(part => typeof part === 'string' ? part : part.key).join('')
