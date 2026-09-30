import { describe, it, expect } from 'vitest'
import { KEY_GUIDE, KEY_INSTRUCTIONS, guideText } from '@/app/dominoFill/keyGuide'

/**
 * The key guide's wording (keyboard polish, section 2 of its contract in NEXT-STEPS).
 *
 * The wording is the contract's, corrected at codex's first review: short but accurate. When
 * it shows, and that it fits, is e2e/keyGuide.spec.ts.
 */

describe('the visible guide', () => {
    it('says the default mode\'s two keys in turn, not as a chord', () => {
        expect(guideText('drag')).toBe('Space, then an arrow: place · Delete: remove')
        expect(guideText('drag')).not.toMatch(/\+/)
    })

    it('says what Space does in Pick a piece mode, and where Tab goes', () => {
        expect(guideText('pick')).toBe('Space: place or remove · Tab: piece picker')
    })

    it('marks the keys, and only the keys', () => {
        const keys = (mode: 'drag' | 'pick') =>
            KEY_GUIDE[mode].flatMap(part => typeof part === 'string' ? [] : [part.key])
        expect(keys('drag')).toEqual(['Space', 'arrow', 'Delete'])
        expect(keys('pick')).toEqual(['Space', 'Tab'])
    })
})

describe('the full instructions, for a screen reader', () => {
    it('are the contract\'s, per mode', () => {
        expect(KEY_INSTRUCTIONS.drag).toBe(
            'Arrow keys move. Space or Enter selects a square, then an arrow key places a piece '
            + 'that way. Escape cancels. Delete removes a piece. Ctrl/Cmd+Z undoes.')
        expect(KEY_INSTRUCTIONS.pick).toBe(
            'Arrow keys move. Space or Enter places the held piece, or removes a placed one. '
            + 'Delete removes a piece. Ctrl/Cmd+Z undoes. Tab goes to the piece picker, where an '
            + 'arrow key switches the piece; Shift+Tab comes back to the same square.')
    })

    it('name both undo chords, since the board takes either (codex)', () => {
        for (const text of Object.values(KEY_INSTRUCTIONS)) expect(text).toContain('Ctrl/Cmd+Z')
    })
})
