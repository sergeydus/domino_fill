// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runInAction } from 'mobx'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { StoreContext } from '@/app/provider'
import CompletionCard from '@/app/dominoFill/CompletionCard'

/**
 * The completion card (spec P1-4), and P1-1's deferred completion-focus clause.
 *
 * The clause — "on completion, focus moves to the Next-level control" — was deferred out of
 * row 13 because there was nothing focusable to move to: the level arrows are `motion.div`s
 * with an `onClick`. The card brings its own real `<button>`, so it closes here.
 */

let root: RootStore

const session = () => new PuzzleSession(definitionFrom({
    puzzleId: 'card-test',
    board: Array.from({ length: 2 }, () => Array(2).fill(null)),
    boardHorizontalNumbers: '1,0',
    boardVerticalNumbers: '1,0',
}), root)

const renderCard = (s: PuzzleSession) => {
    const view = render(
        <StoreContext.Provider value={root}>
            <CompletionCard session={s} levels={root.boardsStore} />
        </StoreContext.Provider>
    )
    return {
        ...view,
        card: view.container.querySelector('[data-completion-card]') as HTMLElement,
        next: view.container.querySelector('[data-next-level]') as HTMLButtonElement | null,
        replay: view.container.querySelector('[data-replay]') as HTMLButtonElement,
    }
}

beforeEach(() => { root = new RootStore() })
afterEach(cleanup)

describe('the card says something happened', () => {
    it('announces itself to assistive technology', () => {
        // The original failure mode was silence: the board stopped responding and nothing
        // told anyone why. A live region is what makes the win perceivable without sight.
        const view = renderCard(session())

        expect(view.card.getAttribute('role')).toBe('status')
        expect(view.card.getAttribute('aria-live')).toBe('polite')
        expect(view.card.textContent).toMatch(/solved/i)
    })

    it('offers a way onward', () => {
        const view = renderCard(session())
        expect(view.replay).toBeTruthy()
        expect(view.next).toBeTruthy()
    })
})

describe('P1-1 completion-focus clause', () => {
    it('focus moves to Next when there is a next level', () => {
        const view = renderCard(session())
        expect(document.activeElement).toBe(view.next)
    })

    it('falls back to Replay on the last level, where there is no Next', () => {
        // "Focus the primary action" is the rule; on the last level of a difficulty there
        // is no next one to offer, so the card must not be left with focus nowhere.
        runInAction(() => { root.boardsStore.setLevel(3) })
        const view = renderCard(session())

        expect(view.next).toBeNull()
        expect(document.activeElement).toBe(view.replay)
    })

    it('the controls are real buttons, which is why the clause could close here', () => {
        runInAction(() => { root.boardsStore.setLevel(1) })
        const view = renderCard(session())

        expect(view.next!.tagName).toBe('BUTTON')
        expect(view.replay.tagName).toBe('BUTTON')
    })
})

describe('the actions do what they say', () => {
    it('Next advances the level', () => {
        runInAction(() => { root.boardsStore.setLevel(1) })
        const view = renderCard(session())

        act(() => { fireEvent.click(view.next!) })
        expect(root.boardsStore.level).toBe(2)
    })

    it('Next is absent rather than dead on the last level', () => {
        runInAction(() => { root.boardsStore.setLevel(3) })
        const view = renderCard(session())

        expect(view.next).toBeNull()
        expect(root.boardsStore.hasNextLevel).toBe(false)
    })

    it('Replay resets the board it was given', () => {
        const s = session()
        act(() => {
            runInAction(() => {
                s.placeToward([0, 0], 'down')
                s.setCompleted(true)
            })
        })
        const view = renderCard(s)

        act(() => { fireEvent.click(view.replay) })

        expect(s.completed).toBe(false)
        expect(s.board[0][0]).toBeNull()
        expect(s.canUndo).toBe(false)
    })
})
