// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runInAction } from 'mobx'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { StoreContext } from '@/app/provider'
import ClientBoard from '@/app/dominoFill/ClientBoard'
import GameControls from '@/app/dominoFill/GameControls'

/**
 * The soft-lock escape hatch, against a board that is genuinely solved (spec P1-3, D10-h).
 *
 * The point of D10-h is not that Reset is clickable — it is that Reset stays reachable
 * *while the board refuses input*. A completed board sets `pointerEvents: 'none'` on its
 * shell, and the completion reaction only ever sets `completed` true, so before this row
 * winning was terminal: no restart, no undo, nothing but a page reload.
 *
 * A browser test would be the better home for this, but completing a shipped puzzle needs
 * its solution, and there is no solver until P1-6. Here the board is small enough to solve
 * outright, so the session really is `completedByRules` rather than merely flagged —
 * see the note in e2e/undo.spec.ts, which defers the browser path to row 15.
 */

let root: RootStore

/**
 * A 2x2 with the right-hand column rocked out: one vertical domino solves it.
 *
 * Column sums 1 and 0, row sums 1 and 0 — the 1 on top, the 0 below, which is exactly what
 * placing downward from (0,0) produces.
 */
const solvableSession = () => {
    const board = Array.from({ length: 2 }, () => Array<number | null>(2).fill(null))
    board[0][1] = -1
    board[1][1] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'completed-test',
        board,
        boardHorizontalNumbers: '1,0',
        boardVerticalNumbers: '1,0',
    }), root)
}

const renderGame = (s: PuzzleSession) => {
    const view = render(
        <StoreContext.Provider value={root}>
            <div>
                <ClientBoard boardsStore={s} />
                <GameControls boardsStore={s} />
            </div>
        </StoreContext.Provider>
    )
    return {
        ...view,
        shell: view.container.querySelector('[data-board-shell]') as HTMLElement,
        reset: view.container.querySelector('[data-reset]') as HTMLButtonElement,
        undo: view.container.querySelector('[data-undo]') as HTMLButtonElement,
    }
}

/**
 * Solve it for real: the completion flag is then earned, not asserted.
 *
 * Inside `act`, because the assertions here read the rendered DOM. A MobX mutation outside
 * it updates the store and schedules the observer's re-render, but React has not flushed by
 * the time the next line runs -- so the DOM still shows the previous state and every
 * assertion about it silently checks the wrong frame.
 */
const win = (s: PuzzleSession) => {
    act(() => {
        runInAction(() => { s.placeToward([0, 0], 'down') })
    })
    expect(s.completedByRules, 'the fixture is actually solvable').toBe(true)
    act(() => {
        runInAction(() => { s.setCompleted(true) })
    })
}

beforeEach(() => { root = new RootStore() })
afterEach(cleanup)

describe('a completed board', () => {
    it('refuses pointer input', () => {
        const s = solvableSession()
        const view = renderGame(s)
        expect(view.shell.style.pointerEvents).toBe('auto')

        win(s)
        expect(view.shell.style.pointerEvents).toBe('none')
    })

    it('keeps the controls outside the inert subtree', () => {
        // The property that makes Reset an escape hatch rather than another way to get
        // stuck: if it lived inside the shell, `pointerEvents: none` would take it too.
        const s = solvableSession()
        const view = renderGame(s)
        win(s)

        expect(view.shell.contains(view.reset)).toBe(false)
        expect(view.shell.contains(view.undo)).toBe(false)
        expect(view.reset.disabled).toBe(false)
    })

    it('is released by Reset, which restores interaction', () => {
        const s = solvableSession()
        const view = renderGame(s)
        win(s)
        expect(view.shell.style.pointerEvents).toBe('none')

        act(() => { fireEvent.click(view.reset) })

        expect(s.completed).toBe(false)
        expect(view.shell.style.pointerEvents).toBe('auto')
        // And the board is genuinely playable again, not merely un-styled.
        expect(s.board[0][0]).toBeNull()
        expect(s.legalDirections([0, 0])).toContain('down')
    })

    it('is released by Undo, which also clears the flag', () => {
        // Undo has to recompute `completed`: the reaction that sets it never unsets it, so
        // reversing the winning move would otherwise leave the board flagged solved and
        // refusing input -- a soft-lock reached by the action meant to escape one.
        const s = solvableSession()
        const view = renderGame(s)
        win(s)

        act(() => { fireEvent.click(view.undo) })

        expect(s.completed).toBe(false)
        expect(view.shell.style.pointerEvents).toBe('auto')
        expect(s.board[0][0]).toBeNull()
    })

    it('leaves Undo usable while the board itself is inert', () => {
        const s = solvableSession()
        const view = renderGame(s)
        win(s)

        expect(view.undo.disabled).toBe(false)
    })
})
