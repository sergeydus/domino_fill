// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runInAction } from 'mobx'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { StoreContext } from '@/app/provider'
import Tutorial from '@/app/dominoFill/Tutorial'
import ClientBoard from '@/app/dominoFill/ClientBoard'

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
        s.setMaxBoardSize(320)
        return s
    }

    it('no longer falls through to a fixed 96px cell', () => {
        const s = tutorialSession()
        expect(s.squareSize).not.toBe(96)
    })

    it('fits the ACTUAL shell -- including the grid border -- inside the cap', () => {
        const s = tutorialSession()
        // The shell is one gutter, n cells and the border -- not (n+2) cells.
        expect(s.shellWidth).toBeLessThanOrEqual(320)
        expect(s.shellWidth).toBe(s.gutterSize + s.squareSize * 2 + 8)
    })

    it('shrinks with the available width on a narrow screen', () => {
        const s = tutorialSession()
        const atDesktop = s.squareSize
        runInAction(() => { root.sizeStore.setBoardSize(200) })
        expect(s.squareSize).toBeLessThan(atDesktop)
        expect(s.shellWidth).toBeLessThanOrEqual(200)
    })

    it('every board size fits the width it was sized to, border included', () => {
        // The previous values (96/85/77) were pinned as "unchanged", but they were
        // computed without the border: a 6x6 shell was 776px inside a 768px budget.
        const make = (n: number) => new PuzzleSession(definitionFrom({
            puzzleId: `g-${n}`,
            board: Array.from({ length: n }, () => Array(n).fill(null)),
            boardHorizontalNumbers: Array(n).fill(0).join(','),
            boardVerticalNumbers: Array(n).fill(0).join(','),
        }), root)

        for (const n of [2, 6, 7, 8]) {
            const s = make(n)
            expect(s.shellWidth, `${n}x${n} shell`).toBeLessThanOrEqual(s.availableWidth)
            expect(s.squareSize).toBeGreaterThan(0)
        }
    })

    it('the rendered wrapper is given the shell width, not the raw available width', () => {
        const s = tutorialSession()
        const { container } = render(
            <StoreContext.Provider value={root}>
                <ClientBoard boardsStore={s} />
            </StoreContext.Provider>
        )
        const wrapper = container.querySelector('[style*="width"]') as HTMLElement
        expect(wrapper).toBeTruthy()
        expect(wrapper.style.width).toBe(`${s.shellWidth}px`)
        // The bug this replaces: the wrapper took the global boardSize (768 on desktop)
        // and ignored the session's cap entirely.
        expect(wrapper.style.width).not.toBe(`${root.sizeStore.boardSize}px`)
    })
})
