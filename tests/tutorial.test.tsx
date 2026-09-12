// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runInAction } from 'mobx'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { StoreContext } from '@/app/provider'
import Tutorial from '@/app/dominoFill/Tutorial'

/**
 * P0-9a: the tutorial's correctness bugs.
 *
 * The rule text is the highest-value fix here -- it stated a rule the game does not have.
 * The rest is about never being able to trap a player behind an unskippable gate.
 */

let root: RootStore

const memoryStorage = (): Storage => {
    let map = new Map<string, string>()
    return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => { map.set(k, String(v)) },
        removeItem: (k: string) => { map.delete(k) },
        clear: () => { map = new Map() },
        key: (i: number) => [...map.keys()][i] ?? null,
        get length() { return map.size },
    } as Storage
}

const useStorage = (impl: unknown) => {
    Object.defineProperty(window, 'localStorage', {
        configurable: true, writable: true, value: impl,
    })
}

const renderTutorial = () => render(
    <StoreContext.Provider value={root}>
        <Tutorial />
    </StoreContext.Provider>
)

beforeEach(() => {
    root = new RootStore()
    useStorage(memoryStorage())
})
afterEach(cleanup)

describe('the stated rule matches the implemented rule', () => {
    it('does not claim the numbers count dominoes', () => {
        renderTutorial()
        const text = document.body.textContent ?? ''
        // The old copy: "the numbers ... indicate how many domino pieces should be placed".
        expect(text).not.toMatch(/how many domino/i)
        expect(text).toMatch(/not a count of dominoes/i)
    })

    it('states the asymmetric pip values of both orientations', () => {
        renderTutorial()
        const text = (document.body.textContent ?? '').replace(/\s+/g, ' ')
        expect(text).toMatch(/upright.*1.*top.*0.*bottom/i)
        expect(text).toMatch(/flat.*0.*left.*2.*right/i)
    })

    it('explains that the numbers are totals of values', () => {
        renderTutorial()
        expect(document.body.textContent).toMatch(/total of the values/i)
    })

    it('mentions that rocks cannot be covered', () => {
        renderTutorial()
        expect(document.body.textContent).toMatch(/rocks/i)
    })
})

describe('the tutorial cannot trap a player', () => {
    it('offers a Skip that is enabled without solving anything', () => {
        renderTutorial()
        const skip = screen.getByRole('button', { name: /skip/i }) as HTMLButtonElement
        expect(skip.disabled).toBe(false)
    })

    it('Skip dismisses the tutorial and remembers the choice', () => {
        const { container } = renderTutorial()
        fireEvent.click(screen.getByRole('button', { name: /skip/i }))

        expect(container.innerHTML).toBe('')
        expect(window.localStorage.getItem('hasSeenTutorial')).toBe('true')
    })

    it('stays dismissed on a later mount', () => {
        window.localStorage.setItem('hasSeenTutorial', 'true')
        const { container } = renderTutorial()
        expect(container.innerHTML).toBe('')
    })

    it('keeps "Got it!" gated on solving, as the reward path', () => {
        renderTutorial()
        const gotIt = screen.getByRole('button', { name: /got it/i }) as HTMLButtonElement
        expect(gotIt.disabled).toBe(true)
    })
})

describe('overlay positioning', () => {
    it('is fixed to the viewport, not absolutely positioned', () => {
        // `absolute w-full h-full` with no positioned ancestor resolves against the initial
        // containing block, covering only the first viewport of a two-viewport page.
        const { container } = renderTutorial()
        const overlay = container.firstElementChild as HTMLElement

        expect(overlay.className).toContain('fixed')
        expect(overlay.className).toContain('inset-0')
        expect(overlay.className).not.toContain('absolute')
    })
})

describe('tutorial board sizing', () => {
    const tutorialSession = () => {
        const s = new PuzzleSession(definitionFrom({
            puzzleId: 'tutorial-v1',
            board: [[null, null], [null, null]],
            boardHorizontalNumbers: '1,1',
            boardVerticalNumbers: '2,0',
        }), root)
        s.setMaxBoardWidth(320)
        return s
    }

    it('no longer falls through to a fixed 96px cell', () => {
        const s = tutorialSession()
        expect(s.squareSize).not.toBe(96)
    })

    it('fits its shell inside the cap', () => {
        const s = tutorialSession()
        // Two gutter columns plus the board itself.
        expect(s.squareSize * (2 + 2)).toBeLessThanOrEqual(320)
    })

    it('shrinks with the available width on a narrow screen', () => {
        const s = tutorialSession()
        const atDesktop = s.squareSize
        runInAction(() => { root.sizeStore.setBoardSize(200) })
        expect(s.squareSize).toBeLessThan(atDesktop)
    })

    it('leaves the real board sizes unchanged', () => {
        const make = (n: number) => new PuzzleSession(definitionFrom({
            puzzleId: `g-${n}`,
            board: Array.from({ length: n }, () => Array(n).fill(null)),
            boardHorizontalNumbers: Array(n).fill(0).join(','),
            boardVerticalNumbers: Array(n).fill(0).join(','),
        }), root)

        // The generalised formula must reproduce the old switch exactly at 768px.
        expect(make(6).squareSize).toBe(96)
        expect(make(7).squareSize).toBe(85)
        expect(make(8).squareSize).toBe(77)
    })
})
