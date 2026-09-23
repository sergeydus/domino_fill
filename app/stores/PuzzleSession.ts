"use client"
import { makeAutoObservable } from "mobx"
import { RootStore } from "./RootStore"
import { MIN_CELL_PX } from "./cellFloor"
import { PuzzleDefinition, cloneInitialBoard } from "./PuzzleDefinition"
import {
    columnSums, rowSums, isBoardFull, targetsMatch, columnComplete, rowComplete, lineState,
    type LineState,
} from "./boardRules"
import {
    Cell, DIRECTIONS, Direction, directionBetween, dominoFrom, neighbourOf, orderedPair, sameCell,
} from "./placement"
import { checkPosition, hintFor, type Advice } from "./advice"

/** Total border around the grid on one axis: `border-4` on each side (ClientBoard). */
export const GRID_BORDER_PX = 8

/**
 * The label gutter, as a fraction of a cell (spec P0-3).
 *
 * 0.7, not a full cell. At a full cell the shell is `(n + 1)*cell + border`, which cannot
 * fit an 8x8 board on a 360px screen at any usable cell size. 0.7 is the smallest gutter
 * that still holds a two-digit label: sums reach 13, and at `LABEL_FONT_FRACTION` a
 * two-digit label measures about 0.61 cell.
 *
 * One gutter per axis, not two. The right-hand gutter used to be rendered as a duplicate
 * of the left one, costing a whole column of width on the device with none to spare.
 */
export const GUTTER_FRACTION = 0.7

/**
 * Label font size as a fraction of a cell. Was a constant `text-6xl` (60px).
 *
 * 0.5, not 0.55. A font's *content area* -- ascent plus descent -- is taller than its em
 * box: measured at 21px in Geist it occupies 27px. `line-height: 1` shrinks the line box
 * but not the glyphs, so the text overflowed the 26px gutter it was declared to fit while
 * every box measurement said it fitted. The gutter has to hold `font * ~1.3`, so the
 * fraction has to stay below `GUTTER_FRACTION / 1.3` = 0.538.
 */
export const LABEL_FONT_FRACTION = 0.5

/**
 * Cell floor, in CSS px. Declared in `cellFloor.ts`, which is not a client module, so a
 * server component can read its *value*: imported from here, it would be a client reference,
 * and `cell < MIN_CELL_PX` would compare a number against a reference. Re-exported so that
 * everything which imported it from here still does.
 */
export { MIN_CELL_PX }

/**
 * Where the pointer is: a cell, and nothing else (spec P1-2).
 *
 * The cell index comes from the browser's own hit-testing -- the element under the pointer,
 * via `data-cell` -- rather than from dividing a coordinate by the store's idea of the cell
 * size. There is no sub-cell position any more either: the half-of-the-cell rule it used to
 * feed was replaced by the drag direction (P1-1), so the last piece of cell-relative
 * arithmetic went with it. Hit-testing now reads no rect at all.
 */
/** What a press or a key press did, for feedback and for the tests. */
export type PlacementOutcome = 'placed' | 'removed' | 'candidates' | 'cleared' | 'none'

/**
 * A gesture in progress.
 *
 * `drag` is a pointer held down on a cell. `pending` is a tap that could not decide --
 * more than one direction was legal -- waiting for a second tap or an arrow key. Both are
 * the same shape because they are the same verb at different stages: an anchor, awaiting
 * a direction.
 */
/**
 * Cap on the move stack (spec P1-3: "bounded move stack").
 *
 * Bounded because a session lives as long as the page and is never discarded -- LevelStore
 * keeps one per puzzle, and P0-5 requires that -- so an unbounded stack grows for as long
 * as someone keeps playing.
 *
 * 60 is a memory-and-usefulness choice, **not** coverage of a longest possible game: there
 * is no such thing, because a piece can be placed and removed indefinitely. For scale, the
 * largest shipped board has 58 playable cells (8x8 with 6 rocks) = 29 dominoes, so filling
 * it once and clearing it again is already 58 recorded moves. What the cap buys is that the
 * recent past is always undoable; a player who wants to go further back has Reset.
 */
export const MAX_UNDO = 60

/**
 * One reversible mutation: the cells it touched, and what was in them beforehand.
 *
 * Recorded as *prior contents* rather than as "a placement" or "a removal", so undoing is
 * one operation instead of two inverses that could disagree. A placement's `before` is two
 * nulls; a removal's is the domino's two values. Nothing else can produce a move, because
 * the only two methods that write to the board are the ones that record here.
 *
 * `anchor` is where the focus goes afterwards -- the spec's rule that after removing or
 * undoing, focus lands on the affected anchor.
 */
export type Move = {
    cells: readonly [Cell, Cell]
    before: readonly [number | null, number | null]
    anchor: Cell
}

/**
 * Keyboard modifiers, as the board needs to see them.
 *
 * All four, not just the two that select a shortcut: `shift` and `alt` are what separate
 * undo from redo and from the OS's own chords, so a handler that drops them cannot tell
 * `Ctrl+Z` from `Ctrl+Shift+Z`.
 */
export type Modifiers = { ctrl?: boolean, meta?: boolean, shift?: boolean, alt?: boolean }

export type Gesture =
    | { kind: 'drag', from: Cell }
    | { kind: 'pending', from: Cell }

/**
 * The mutable half of a puzzle: one player's progress on one `PuzzleDefinition`.
 *
 * Sessions are long-lived and stable — `LevelStore` keeps one per `puzzleId` so that
 * switching difficulty or level and coming back returns the same object with the same moves
 * on it. The board is deep-cloned from the definition at construction, so gameplay never
 * writes through to the definition or to the imported JSON it came from.
 */
export class PuzzleSession {
    rootStore: RootStore
    readonly definition: PuzzleDefinition
    board: (number | null)[][]
    completed: boolean = false
    /**
     * The cell the pointer is over, or null when it is not over this board at all.
     *
     * Per-session rather than global: two boards can be mounted at once (the tutorial
     * renders its own 2x2 over the live board), and a shared slot means the tutorial's
     * pointer drives a phantom highlight on the board behind it.
     */
    hover: Cell | null = null
    /**
     * Ceiling on the shell size this board may occupy, in CSS px, on both axes.
     * The tutorial renders inside a modal and must not claim the full board width.
     */
    maxBoardSize: number = Infinity

    /**
     * The box the board may occupy, in CSS px, as measured from the page.
     *
     * Null until the first measurement: on the server, and on the first client render,
     * there is nothing to measure. `FALLBACK_BOX` stands in until then.
     *
     * Measured from the viewport minus the chrome around the board -- never from the
     * board's own container. The board is laid out from this number, so measuring a box
     * whose size depends on the board's would be a feedback loop: a floored board
     * overflows its area, the column grows, the area grows, the cell grows.
     */
    availableBox: { width: number, height: number } | null = null

    /** The gesture in progress, if any. See `Gesture`. */
    gesture: Gesture | null = null

    /**
     * The last thing an input actually did, and a counter that changes every time.
     *
     * The counter is what the view watches: two rejections in a row are two events, but
     * `lastOutcome` alone would not change between them and nothing would fire the second
     * time. Feedback is driven from here rather than from the pointer handler so that the
     * keyboard gets exactly the same treatment -- a rejected arrow key should shake the
     * board just as a rejected drag does.
     */
    lastOutcome: PlacementOutcome = 'none'
    outcomeTick = 0

    /**
     * How many moves the board has refused. Starts at zero, and zero means *none yet*.
     *
     * Separate from `outcomeTick` because the view needs to distinguish "the last thing
     * that happened was a refusal" from "a refusal just happened". `lastOutcome` starts as
     * `'none'`, which is the honest initial value -- nothing has happened -- but a view
     * reading it as "rejected" shakes the board on load. Measured: it did, arriving
     * mid-animation at `translateX(-5.64px)`, which knocked every column label out of
     * alignment with its column by about 5px.
     */
    rejectionTick = 0

    /** Record what just happened, so the view can respond to it once. */
    private signal(outcome: PlacementOutcome): PlacementOutcome {
        this.lastOutcome = outcome
        this.outcomeTick++
        if (outcome === 'none') this.rejectionTick++
        return outcome
    }

    /**
     * What Check or Hint last said, and a counter so repeating it is an event (spec P1-5).
     *
     * A counter for the same reason `outcomeTick` has one: pressing Check twice on an
     * unchanged board is two questions and deserves two answers. A live region watching the
     * value alone would stay silent the second time, which is exactly when a player is
     * pressing it again because they are not sure it did anything.
     */
    advice: Advice | null = null
    adviceTick = 0

    private say(advice: Advice): Advice {
        this.advice = advice
        this.adviceTick++
        return advice
    }

    clearAdvice() {
        this.advice = null
    }

    /**
     * Is this position still finishable? (spec P1-5, row 18e)
     *
     * Reads the board; writes nothing but `advice`. The board and the undo stack are handed
     * to `checkPosition` as values and copied before anything walks backwards over them, so
     * asking the question cannot change the answer to any other question -- including
     * whether Undo is available, and what persistence is about to save.
     */
    check(): Advice {
        return this.say(checkPosition(this.definition, this.board, { moves: this.moves }))
    }

    /** One forced cell, if there is one. Reveals; never places. */
    hint(): Advice {
        return this.say(hintFor(this.definition, this.board, { moves: this.moves }))
    }

    /** The cell a hint is pointing at, or null. Drives the marker on the board. */
    get hintCell(): Cell | null {
        return this.advice?.kind === 'hint' ? this.advice.cell : null
    }

    /** The cell the keyboard is on. Null until the board is first used from a keyboard. */
    focusedCell: Cell | null = null

    /**
     * Completed moves, oldest first. Bounded at `MAX_UNDO`; the oldest is dropped.
     *
     * Undo pops from the end and does not push, so there is no redo -- deliberately. A redo
     * stack has to answer what happens when you undo, place something else, then redo,
     * and every answer is a rule the player has to learn. Undo alone needs no explanation.
     */
    moves: Move[] = []

    constructor(definition: PuzzleDefinition, rootStore: RootStore) {
        this.definition = definition
        this.rootStore = rootStore
        this.board = cloneInitialBoard(definition)
        makeAutoObservable(this, { definition: false, rootStore: false })
    }

    get puzzleId() { return this.definition.puzzleId }

    setHover(cell: Cell | null) {
        // Guard here rather than at the call site: an index that is not a cell of this
        // board is no hover at all, however it was arrived at.
        this.hover = cell && this.inBounds(cell[0], cell[1]) ? cell : null
    }

    /** Called when the pointer leaves this board; without it the highlight sticks. */
    clearHover() {
        this.hover = null
    }

    /** Discard all progress and start this puzzle again from its definition. */
    reset() {
        this.board = cloneInitialBoard(this.definition)
        this.completed = false
        this.hover = null
        this.gesture = null
        // The stack described moves against a board that no longer exists; undoing into it
        // would write dominoes back onto a freshly cleared grid.
        this.moves = []
        this.focusedCell = null
        this.clearAdvice()
    }

    /** Sum of pips in each column; compared against `definition.columnTargets`. */
    get currentColumnSums() {
        return columnSums(this.board, this.definition.size)
    }

    /** Sum of pips in each row; compared against `definition.rowTargets`. */
    get currentRowSums() {
        return rowSums(this.board, this.definition.size)
    }

    /** Every non-rock cell covered, on a well-formed board. Pure; no side effects. */
    get isBoardFull() {
        return isBoardFull(this.board, this.definition.size)
    }

    /**
     * What each column's label should say about itself (spec P1-5, D10-g).
     *
     * Green fired on *sum satisfied* before this, so a line turned green with empty cells
     * still in it -- 1+0+2+0 reaches 3 with half the column unplayed -- telling the player
     * they had finished a line they had not. `satisfied` now needs the line full as well.
     */
    get columnStates(): LineState[] {
        const targets = this.definition.columnTargets.split(',').map(Number)
        return this.currentColumnSums.map((sum, j) => lineState(
            sum, targets[j], columnComplete(this.board, this.definition.size, j),
        ))
    }

    /** What each row's label should say about itself. See `columnStates`. */
    get rowStates(): LineState[] {
        const targets = this.definition.rowTargets.split(',').map(Number)
        return this.currentRowSums.map((sum, i) => lineState(
            sum, targets[i], rowComplete(this.board, this.definition.size, i),
        ))
    }

    /** Both target axes match exactly. Pure; no side effects. */
    get targetsMatch() {
        return targetsMatch(this.board, this.definition)
    }

    /** The box this board may occupy, in CSS px, after its own ceiling is applied. */
    get availableWidth() {
        const measured = this.availableBox?.width ?? this.rootStore.sizeStore.boardSize
        return Math.min(measured, this.maxBoardSize)
    }

    get availableHeight() {
        const measured = this.availableBox?.height ?? this.rootStore.sizeStore.boardSize
        return Math.min(measured, this.maxBoardSize)
    }

    /** Cells this axis has to pay for: n cells plus one fractional label gutter. */
    private get trackCount() {
        return this.definition.size + GUTTER_FRACTION
    }

    /** The largest cell that fits a budget of `px` on one axis. */
    private cellFor(px: number) {
        return Math.floor((px - GRID_BORDER_PX) / this.trackCount)
    }

    /**
     * Cell size in CSS px: the largest that fits both axes, floored at `MIN_CELL_PX`
     * against the height only.
     *
     * Both axes, because width alone is what made a 360px-wide board overflow a 400px-tall
     * landscape screen. Asymmetric, because horizontal overflow is forbidden and vertical
     * scrolling is not: the width budget always wins, and only the height budget may be
     * overridden by the floor.
     *
     * `floor`, not `round`: rounding up overflows the box by up to a pixel per track.
     */
    get squareSize() {
        const byWidth = this.cellFor(this.availableWidth)
        const byHeight = this.cellFor(this.availableHeight)
        return Math.max(1, Math.min(byWidth, Math.max(byHeight, MIN_CELL_PX)))
    }

    /** Width of the label gutter, in CSS px. Integer, so it cannot smear the alignment. */
    get gutterSize() {
        return Math.floor(this.squareSize * GUTTER_FRACTION)
    }

    /** Label font size in CSS px, derived from the cell rather than a fixed `text-6xl`. */
    get labelFontSize() {
        return Math.round(this.squareSize * LABEL_FONT_FRACTION)
    }

    /**
     * What the board shell actually occupies on one axis: the gutter, the n cells, and
     * the grid's border. Both axes are the same -- one gutter each, above and to the left.
     *
     * This is what the layout must be given. Sizing the wrapper from the raw available
     * width instead lets the content overflow it.
     */
    get shellWidth() {
        return this.gutterSize + this.definition.size * this.squareSize + GRID_BORDER_PX
    }

    get shellHeight() {
        return this.shellWidth
    }

    /** True when the height budget was overridden by the floor, so the page must scroll. */
    get isHeightConstrained() {
        return this.cellFor(this.availableHeight) < this.squareSize
    }

    setMaxBoardSize(size: number) {
        this.maxBoardSize = size
    }

    setAvailableBox(box: { width: number, height: number } | null) {
        this.availableBox = box
    }

    private inBounds(i: number, j: number) {
        return Number.isInteger(i) && Number.isInteger(j)
            && i >= 0 && j >= 0
            && i < this.board.length && j < this.board.length
    }

    private at(i: number, j: number): number | null | undefined {
        return this.inBounds(i, j) ? this.board[i][j] : undefined
    }

    /**
     * Resolve the cell (i,j) to the complete pair of cells its domino occupies, or null if
     * it does not belong to exactly one well-formed domino.
     *
     * A vertical domino is a 1 with a 0 directly below; a horizontal is a 2 with a 0
     * directly to its left. A 0 is therefore owned by a 1 above OR a 2 to its right --
     * and if it has neither owner, or both, the board is corrupt and we refuse to guess.
     *
     * Resolving before mutating is what keeps the pairing invariant (spec D6) intact: a
     * half-removal would leave an orphan, and orphans are the only way a sums-match board
     * with empty cells becomes reachable.
     */
    /**
     * How many well-formed dominoes claim the 0 at (i,j): a 1 directly above, and/or a 2
     * directly to the right. Exactly one means the 0 is unambiguously owned.
     */
    private ownersOfZero(i: number, j: number): number {
        if (this.at(i, j) !== 0) return 0
        return (this.at(i - 1, j) === 1 ? 1 : 0) + (this.at(i, j + 1) === 2 ? 1 : 0)
    }

    /**
     * Resolve the cell (i,j) to the complete pair of cells its domino occupies, or null if
     * it does not belong to exactly one well-formed domino.
     *
     * A vertical domino is a 1 with a 0 directly below; a horizontal is a 2 with a 0
     * directly to its left. A 0 is therefore owned by a 1 above OR a 2 to its right.
     *
     * Every branch checks the 0's *complete* owner set, not just its own claim on it. A 1
     * above a 0 that a 2 also claims is not a removable domino: removing that pair would
     * leave the 2 orphaned. So an ambiguous pattern is refused from all three of its cells,
     * not only from the 0.
     *
     * Resolving before mutating is what keeps the pairing invariant (spec D6) intact: a
     * half-removal leaves an orphan, and orphans are the only way a sums-match board with
     * empty cells becomes reachable.
     */
    pairAt(i: number, j: number): readonly [readonly [number, number], readonly [number, number]] | null {
        const value = this.at(i, j)
        if (value === undefined || value === null || value === -1) return null

        if (value === 1) {
            // Vertical: 1 on top, 0 below -- and that 0 must be claimed by this 1 alone.
            if (this.at(i + 1, j) !== 0) return null
            if (this.ownersOfZero(i + 1, j) !== 1) return null
            return [[i, j], [i + 1, j]]
        }
        if (value === 2) {
            // Horizontal: 2 on the right, 0 to its left -- claimed by this 2 alone.
            if (this.at(i, j - 1) !== 0) return null
            if (this.ownersOfZero(i, j - 1) !== 1) return null
            return [[i, j], [i, j - 1]]
        }
        if (value === 0) {
            if (this.ownersOfZero(i, j) !== 1) return null // no owner, or ambiguous
            return this.at(i - 1, j) === 1
                ? [[i - 1, j], [i, j]]
                : [[i, j], [i, j + 1]]
        }
        return null // unknown value
    }

    /** Both cells of a domino from `anchor` toward `direction` are free board cells. */
    canPlace(anchor: Cell, direction: Direction): boolean {
        const { cells } = dominoFrom(anchor, direction)
        return cells.every(([i, j]) => this.inBounds(i, j) && this.board[i][j] === null)
    }

    /** Every direction a domino could be placed in from this cell. */
    legalDirections(cell: Cell): Direction[] {
        if (!this.inBounds(cell[0], cell[1]) || this.board[cell[0]][cell[1]] !== null) return []
        return DIRECTIONS.filter(direction => this.canPlace(cell, direction))
    }

    /**
     * Place a domino from `anchor` toward `direction`. Returns whether it was placed.
     *
     * The direction fixes the pip values as well as the shape: dragging up from a cell is
     * a different placement from dragging down from it, because the anchor is the bottom
     * half in one and the top half in the other.
     */
    placeToward(anchor: Cell, direction: Direction): boolean {
        if (!this.canPlace(anchor, direction)) return false
        const { cells, values } = dominoFrom(anchor, direction)
        // `canPlace` has already established both cells are empty, so the prior contents
        // are two nulls -- but they are read rather than assumed, so the record stays
        // correct if that precondition is ever relaxed.
        this.record({
            cells,
            before: [this.board[cells[0][0]][cells[0][1]], this.board[cells[1][0]][cells[1][1]]],
            anchor,
        })
        cells.forEach(([i, j], index) => { this.board[i][j] = values[index] })
        return true
    }

    /**
     * Push a move, dropping the oldest once the stack is full.
     *
     * Every board write goes through here, which is what makes undo total: there is no
     * path that mutates the board and forgets to record it, because `placeToward` and
     * `removePiece` are the only two writers and both call this.
     */
    private record(move: Move) {
        this.moves.push(move)
        if (this.moves.length > MAX_UNDO) this.moves.shift()
        /*
         * Advice describes a position, so a changed position does not make it stale -- it
         * makes it wrong. A hint would go on pointing at a square the player has just
         * filled.
         *
         * Cleared *here* rather than alongside the outcome signal, and that is the whole
         * reason this method is the chokepoint: the signal is a notification, and a
         * placement reached without one -- a keyboard path, a test, whatever is written
         * next -- would still have to invalidate the answer. Every board write goes
         * through `record`; none has to remember to.
         */
        this.clearAdvice()
    }

    /**
     * The cell the pointer is currently over, or null.
     *
     * No grid-to-cell index arithmetic: the browser decided which cell this is when it
     * hit-tested the pointer, and `setHover` has already rejected anything out of bounds.
     */
    get hoveredCell(): Cell | null {
        return this.hover
    }

    /**
     * The cells that would complete a placement from the pending anchor.
     *
     * Offered after a tap on a cell with more than one legal direction: the tap cannot
     * know which way the player meant, so it asks rather than guessing. The rule this
     * replaces guessed, and silently fell through to the opposite direction when the
     * preferred neighbour was taken -- exactly when the board gets interesting.
     */
    get candidateCells(): Cell[] {
        if (this.gesture?.kind !== 'pending') return []
        const anchor = this.gesture.from
        return this.legalDirections(anchor).map(direction => neighbourOf(anchor, direction))
    }

    /** The anchor awaiting a second tap or an arrow key, if there is one. */
    get pendingAnchor(): Cell | null {
        return this.gesture?.kind === 'pending' ? this.gesture.from : null
    }

    /**
     * The pair a placement would occupy right now, for the preview.
     *
     * During a drag it follows the pointer away from the anchor. With no gesture it
     * previews the cell under the pointer, but only when that cell has exactly one legal
     * direction -- the same condition under which a tap commits without asking.
     */
    get highlightedPair(): [[number, number], [number, number]] | null {
        const hovered = this.hoveredCell
        const anchor = this.gesture?.kind === 'drag' ? this.gesture.from : hovered
        if (!anchor) return null

        if (hovered && !sameCell(anchor, hovered)) {
            const direction = directionBetween(anchor, hovered)
            if (direction && this.canPlace(anchor, direction)) {
                return orderedPair(anchor, neighbourOf(anchor, direction))
            }
            return null
        }

        const legal = this.legalDirections(anchor)
        if (legal.length !== 1) return null
        return orderedPair(anchor, neighbourOf(anchor, legal[0]))
    }

    // ---- pointer -------------------------------------------------------------------

    /**
     * The pointer went down on a cell.
     *
     * A press on one of the pending anchor's candidates is the second half of an ambiguous
     * tap, so it must not become a new anchor -- otherwise the candidate the player just
     * aimed at would replace the anchor it was offered for.
     */
    pointerDown(cell: Cell) {
        this.focusedCell = cell
        const pending = this.pendingAnchor
        if (pending) {
            const direction = directionBetween(pending, cell)
            if (direction && this.canPlace(pending, direction)) return
        }
        this.gesture = { kind: 'drag', from: cell }
    }

    /**
     * The pointer came up, over `cell` or over nothing.
     *
     * One entry point for both gestures, because a tap is a drag that did not move: if the
     * release is over a neighbour the drag direction commits, and if it is over the anchor
     * itself tap rules apply.
     */
    pointerUp(cell: Cell | null): PlacementOutcome {
        const pending = this.pendingAnchor
        if (pending && cell) {
            const direction = directionBetween(pending, cell)
            if (direction && this.canPlace(pending, direction)) {
                this.placeToward(pending, direction)
                this.gesture = null
                this.focusedCell = pending
                return this.signal('placed')
            }
        }

        const anchor = this.gesture?.kind === 'drag' ? this.gesture.from : null
        this.gesture = null
        // A release over no cell at all is the pointer leaving the board, not a refused
        // move: it must not shake anything. Hence `silent`, which records nothing.
        if (!anchor || !cell) return pending ? this.signal('cleared') : 'none'

        if (!sameCell(anchor, cell)) {
            const direction = directionBetween(anchor, cell)
            if (direction && this.canPlace(anchor, direction)) {
                this.placeToward(anchor, direction)
                this.focusedCell = anchor
                return this.signal('placed')
            }
            // Released where the domino cannot go: nothing happens, and any pending
            // anchor is dismissed.
            return this.signal(pending ? 'cleared' : 'none')
        }

        return this.signal(this.tap(cell))
    }

    /**
     * A press and release on the same cell.
     *
     * Occupied removes. Empty places, if exactly one direction is legal; if several are,
     * the anchor is held and the candidates are offered for a second tap.
     */
    private tap(cell: Cell): PlacementOutcome {
        const [i, j] = cell
        if (this.board[i][j] !== null) {
            const pair = this.pairAt(i, j)
            if (!this.removePiece(i, j)) return 'none'
            // Focus follows the removal to the pair's anchor, so a keyboard user is left
            // somewhere related to what just happened.
            this.focusedCell = pair ? [pair[0][0], pair[0][1]] : cell
            return 'removed'
        }

        const legal = this.legalDirections(cell)
        if (legal.length === 0) return 'none'
        if (legal.length === 1) {
            this.placeToward(cell, legal[0])
            this.focusedCell = cell
            return 'placed'
        }

        this.gesture = { kind: 'pending', from: cell }
        return 'candidates'
    }

    /**
     * Set the focused cell as the anchor and offer its candidates. The keyboard's
     * activation, which is deliberately *not* the pointer's tap.
     *
     * Space/Enter anchors and waits, even when only one direction is legal -- the spec's
     * keyboard table gives Space/Enter exactly one meaning ("set the focused cell as the
     * anchor") and gives removal to Delete/Backspace alone. Delegating to `tap()` made
     * Space place immediately on a one-direction cell and *remove* on an occupied one,
     * which is two contradictions of that table at once.
     *
     * A tap may commit without asking because the finger is already on the cell it means;
     * the keyboard's arrow is the direction, so there is always a second key coming and
     * nothing is saved by guessing.
     *
     * Returns whether there was anything to anchor.
     */
    private anchorFocused(cell: Cell): boolean {
        const [i, j] = cell
        // Nothing to anchor: occupied cells belong to Delete/Backspace, and a cell with no
        // legal direction would be a mode offering nothing.
        if (this.board[i][j] !== null) return false
        if (this.legalDirections(cell).length === 0) return false

        this.gesture = { kind: 'pending', from: cell }
        return true
    }

    /**
     * Abandon an in-flight drag, leaving a pending anchor alone.
     *
     * This is what `pointerleave` and `pointercancel` want. A touch pointer stops existing
     * at `pointerup`, and the browser then fires `pointerout` and `pointerleave` all the
     * way up the tree -- measured: every tap produced a `pointerleave` on the grid
     * immediately after the release. Cancelling everything there dismissed the candidates
     * the tap had just offered, so a tap on an ambiguous cell appeared to do nothing at
     * all on a touch device. A drag that leaves the board is still abandoned.
     */
    cancelDrag() {
        if (this.gesture?.kind === 'drag') this.gesture = null
        this.hover = null
    }

    /** Abandon everything, pending offer included: the board lost focus entirely. */
    cancelGesture() {
        this.gesture = null
        this.hover = null
    }

    // ---- keyboard ------------------------------------------------------------------

    setFocusedCell(cell: Cell | null) {
        this.focusedCell = cell && this.inBounds(cell[0], cell[1]) ? cell : null
    }

    /**
     * The keyboard verb, which is the same verb: an anchor and a direction.
     *
     * Arrows move the focus until an anchor is set, and choose the neighbour once one is.
     * Returns whether the key was handled, so the caller knows whether to `preventDefault`
     * -- arrows must still scroll the page when the board did not use them.
     */
    handleKey(key: string, modifiers: Modifiers = {}): boolean {
        const arrow: Record<string, Direction> = {
            ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        }

        const ctrl = !!modifiers.ctrl
        const meta = !!modifiers.meta
        const shift = !!modifiers.shift
        const alt = !!modifiers.alt

        /*
         * Undo is exactly one of Ctrl or Meta, with neither Shift nor Alt, on `z`.
         *
         * `ctrl !== meta` rather than `ctrl || meta`: holding both is a third chord, not a
         * louder version of either, and belongs to whatever else wants it.
         *
         * Shift and Alt must be *absent*, not merely ignored. `Ctrl/Cmd+Shift+Z` is the
         * conventional redo chord on every platform that has one, and this board has no
         * redo on purpose -- consuming it as another undo would be actively wrong, taking a
         * second move away just as the player asked for one back. Alt+Ctrl+Z belongs to the
         * OS.
         *
         * Note the uppercase `Z` a shifted press produces is *not* a usable signal here:
         * key case depends on Caps Lock and on the platform's own chord handling, so the
         * modifier flags are the only sound test.
         */
        const undoChord = ctrl !== meta && !shift && !alt && key.toLowerCase() === 'z'
        if (undoChord) {
            // Unhandled when there is nothing to undo, which leaves the keystroke to the
            // browser rather than swallowing it to no effect.
            return this.undo()
        }

        /*
         * Every other modified chord belongs to the browser, **Shift included**.
         *
         * Shift was previously missing from this guard, so Shift+Arrow still moved the
         * focus, Shift+Space still anchored and Shift+Backspace still removed a domino --
         * contradicting this very comment. Shift+Space scrolls a page up and Shift+Arrow
         * extends a selection; a board that quietly eats them is a board that has taken
         * keys it never claimed.
         */
        if (ctrl || meta || shift || alt) return false

        if (key === 'Escape') {
            if (!this.gesture) return false
            this.gesture = null
            return true
        }

        const focused: Cell = this.focusedCell ?? [0, 0]
        if (!this.focusedCell) {
            this.focusedCell = focused
            // Entering the board is itself the action; do not also move or place.
            if (key in arrow || key === ' ' || key === 'Enter') return true
        }

        if (key in arrow) {
            const direction = arrow[key]
            const pending = this.pendingAnchor
            if (pending) {
                // A refused direction keeps the anchor rather than silently choosing
                // another one, which is the whole complaint against the old rule.
                if (!this.canPlace(pending, direction)) {
                    this.signal('none')
                    return true
                }
                this.placeToward(pending, direction)
                this.gesture = null
                this.focusedCell = pending
                this.signal('placed')
                return true
            }
            const next = neighbourOf(focused, direction)
            if (this.inBounds(next[0], next[1])) this.focusedCell = next
            return true
        }

        if (key === ' ' || key === 'Enter') {
            const anchored = this.anchorFocused(focused)
            this.signal(anchored ? 'candidates' : 'none')
            return anchored
        }

        if (key === 'Delete' || key === 'Backspace') {
            const [i, j] = focused
            if (this.board[i][j] === null) return false
            const pair = this.pairAt(i, j)
            if (!this.removePiece(i, j)) {
                // A rock, or a half that resolves to no well-formed domino: refused, and
                // worth saying so rather than doing nothing at all.
                this.signal('none')
                return false
            }
            this.focusedCell = pair ? [pair[0][0], pair[0][1]] : focused
            this.signal('removed')
            return true
        }

        return false
    }

    /**
     * Remove the domino occupying (i,j), from either of its halves.
     * Returns whether anything was removed; callers use it for feedback and undo.
     */
    removePiece(i: number, j: number): boolean {
        const pair = this.pairAt(i, j)
        if (!pair) return false // rejected: nothing is mutated

        const [[ai, aj], [bi, bj]] = pair
        this.record({
            cells: [[ai, aj], [bi, bj]],
            before: [this.board[ai][aj], this.board[bi][bj]],
            anchor: [ai, aj],
        })
        this.board[ai][aj] = null
        this.board[bi][bj] = null
        return true
    }

    /** Whether there is anything to undo. Drives the button's disabled state. */
    get canUndo() {
        return this.moves.length > 0
    }

    /**
     * Reverse the last move. Returns whether anything was undone.
     *
     * Writing back the recorded prior contents restores both cells exactly, which is what
     * makes undoing a removal give back *the same domino* rather than a re-derived one --
     * the distinction matters because a cell's value encodes which half of which
     * orientation it was.
     *
     * `completed` is recomputed rather than left alone. The completion reaction only ever
     * sets it true, so undoing a winning move would otherwise leave the board flagged as
     * solved -- and since `completed` disables pointer input, that is a soft-lock (D10-h)
     * reached by the very action meant to escape one.
     */
    undo(): boolean {
        const move = this.moves.pop()
        if (!move) return false

        move.cells.forEach(([i, j], index) => { this.board[i][j] = move.before[index] })
        this.completed = this.completedByRules
        this.focusedCell = move.anchor
        this.clearAdvice()
        // A gesture in flight was aimed at a board that no longer looks like this.
        this.gesture = null
        return true
    }

    /**
     * The puzzle is solved: the board is full AND both target axes match.
     *
     * The fullness half is an assertion rather than a fix for a reachable bug -- matching
     * the column sums alone already implies a full board, given every 1 is paired with a 0
     * below and every 2 with a 0 to its left (spec D6). It holds only while that pairing
     * invariant holds, which is what `removePiece`'s guard protects. Cheap insurance
     * against a future change that breaks the pairing.
     *
     * Pure: the stored `completed` flag is written only by LevelStore's reaction on this
     * value -- a reaction rather than an autorun, so it tracks this one derived value.
     */
    get completedByRules() {
        return this.isBoardFull && this.targetsMatch
    }

    setCompleted(isCompleted: boolean) {
        this.completed = isCompleted
    }

    /**
     * What is worth saving about this session (spec P1-7).
     *
     * The board and the completion flag, and deliberately nothing else. Hover, focus and the
     * gesture in progress are all properties of *this* pointer at *this* moment, and
     * restoring them would put a highlight under a finger that is not there.
     *
     * `completed` is saved rather than re-derived on load even though it is a function of
     * the board, because the two can legitimately disagree: `reset` clears the flag, and
     * `undo` recomputes it. Saving the flag stores what the player was actually looking at.
     */
    /**
     * Has anything been placed here?
     *
     * Rocks are part of the definition, so they do not count. Used by the rollover rule: an
     * untouched board is nothing to take away, a touched one is.
     */
    get hasMoves(): boolean {
        return this.board.some(row => row.some(cell => cell !== null && cell !== -1))
    }

    get snapshot(): { board: (number | null)[][], completed: boolean } {
        return {
            // A plain copy, not the observable arrays: this value is handed to JSON and to
            // a reaction, and neither should hold a live reference into the board.
            board: this.board.map(row => [...row]),
            completed: this.completed,
        }
    }

    /**
     * Put a saved board back.
     *
     * The caller is responsible for having checked that the record belongs to this puzzle;
     * `progressFor` is where that happens, so there is exactly one path in.
     *
     * **The undo stack is not restored, and is cleared here.** It is not saved either. A
     * `Move` records the cells a placement wrote and what was underneath them, which only
     * means anything against the board that produced it; carrying a stack across a reload
     * would let Undo write dominoes back onto a board that never had them. Losing history at
     * a reload is a smaller cost than an Undo that corrupts the board, and the player keeps
     * the thing they actually care about -- their position.
     */
    restore(progress: { board: (number | null)[][], completed: boolean }) {
        // The copy is for readers, not for safety: probed, assigning a plain array to a
        // deep-observable field makes MobX build its own, so this cannot alias the record it
        // was given however it is written. The copy in `snapshot` above is the one that is
        // load-bearing, and in that direction there is no MobX conversion to rely on.
        this.board = progress.board.map(row => [...row])
        this.completed = progress.completed
        this.moves = []
        this.gesture = null
        this.hover = null
        this.focusedCell = null
        this.advice = null
    }
}
