"use client"
import { makeAutoObservable } from "mobx"
import { RootStore } from "./RootStore"
import { PuzzleDefinition, cloneInitialBoard } from "./PuzzleDefinition"
import { columnSums, rowSums, isBoardFull, targetsMatch } from "./boardRules"

/**
 * Total horizontal border around the grid: `border-4` on each side (ClientBoard).
 * Interim, like the rest of this px-driven sizing -- P0-3 replaces it with a CSS shell.
 */
const GRID_BORDER_PX = 8

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
     * Pointer position within this board's grid, in CSS px, or null when the pointer is
     * not over it.
     *
     * Per-session rather than global: two boards can be mounted at once (the tutorial
     * renders its own 2x2 over the live board), and a shared slot means the tutorial's
     * pointer drives a phantom highlight on the board behind it -- each interpreting the
     * same coordinates through its own squareSize.
     */
    hoverPoint: [number, number] | null = null
    /**
     * Optional ceiling on the width this board may occupy, in CSS px.
     *
     * The tutorial renders inside a modal and must not claim the full board width.
     * Interim: P0-3 replaces this whole px-driven sizing with a CSS shell formula.
     */
    maxBoardWidth: number = Infinity

    constructor(definition: PuzzleDefinition, rootStore: RootStore) {
        this.definition = definition
        this.rootStore = rootStore
        this.board = cloneInitialBoard(definition)
        makeAutoObservable(this, { definition: false, rootStore: false })
    }

    get puzzleId() { return this.definition.puzzleId }

    setHoverPoint(point: [number, number] | null) {
        this.hoverPoint = point
    }

    /** Called when the pointer leaves this board; without it the highlight sticks. */
    clearHover() {
        this.hoverPoint = null
    }

    /** Discard all progress and start this puzzle again from its definition. */
    reset() {
        this.board = cloneInitialBoard(this.definition)
        this.completed = false
        this.hoverPoint = null
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

    /** Both target axes match exactly. Pure; no side effects. */
    get targetsMatch() {
        return targetsMatch(this.board, this.definition)
    }

    /** Width this board may occupy, in CSS px. */
    get availableWidth() {
        return Math.min(this.rootStore.sizeStore.boardSize, this.maxBoardWidth)
    }

    /**
     * Cell size in CSS px.
     *
     * `size + 2` reserves a gutter column on each side for the row/column numbers, and the
     * grid's border is subtracted before dividing -- otherwise the rendered shell is wider
     * than the width it was sized to fit. `floor`, not `round`, for the same reason:
     * rounding up overflows.
     *
     * This used to be a switch over 6/7/8 with a magic `default: 96`, so any other board --
     * the 2x2 tutorial being the only one -- got a fixed 192px regardless of screen width.
     */
    get squareSize() {
        const usable = this.availableWidth - GRID_BORDER_PX
        return Math.max(1, Math.floor(usable / (this.definition.size + 2)))
    }

    /**
     * Total width the board shell actually occupies: both gutters, the grid, and the
     * border. This is what the layout must be given -- sizing the wrapper from the raw
     * available width instead lets the content overflow it.
     */
    get shellWidth() {
        return (this.definition.size + 2) * this.squareSize + GRID_BORDER_PX
    }

    setMaxBoardWidth(width: number) {
        this.maxBoardWidth = width
    }

    /** The pair of cells the currently selected piece would occupy, or null. */
    get highlightedPair(): [[number, number], [number, number]] | null {
        const hoverCords = this.hoverPoint
        if (!hoverCords) return null
        const selectedPiece = this.rootStore.boardsStore.selectedPiece
        if (!selectedPiece) return null

        const size = this.squareSize
        const [x, y] = hoverCords
        const i = Math.floor(y / size)
        const j = Math.floor(x / size)
        const boardSize = this.board.length

        if ((i < 0 || j < 0) || (i >= boardSize || j >= boardSize) || this.board[i][j] != null) {
            return null
        }
        if (selectedPiece == 1) {
            const isAboveHalf = y % size > (size / 2)
            if (isAboveHalf) {
                if (i + 1 < boardSize && this.board[i + 1][j] == null) return [[i, j], [i + 1, j]]
                if (i - 1 >= 0 && this.board[i - 1][j] == null) return [[i, j], [i - 1, j]]
            } else {
                if (i - 1 >= 0 && this.board[i - 1][j] == null) return [[i, j], [i - 1, j]]
                if (i + 1 < boardSize && this.board[i + 1][j] == null) return [[i, j], [i + 1, j]]
            }
        }
        if (selectedPiece == 2) {
            const isLeftHalf = x % size > (size / 2)
            if (isLeftHalf) {
                if (j + 1 < boardSize && this.board[i][j + 1] == null) return [[i, j], [i, j + 1]]
                if (j - 1 >= 0 && this.board[i][j - 1] == null) return [[i, j], [i, j - 1]]
            } else {
                if (j - 1 >= 0 && this.board[i][j - 1] == null) return [[i, j], [i, j - 1]]
                if (j + 1 < boardSize && this.board[i][j + 1] == null) return [[i, j], [i, j + 1]]
            }
        }
        return null
    }

    /**
     * The cell the pointer is currently over, or null when it is outside the board.
     *
     * Interim: this is the same coordinate arithmetic `highlightedPair` already does.
     * P1-2 replaces both with the browser's own hit-testing via `data-cell`.
     */
    get hoveredCell(): [number, number] | null {
        if (!this.hoverPoint) return null
        const size = this.squareSize
        const [x, y] = this.hoverPoint
        const i = Math.floor(y / size)
        const j = Math.floor(x / size)
        return this.inBounds(i, j) ? [i, j] : null
    }

    /** Returns whether a piece was placed. */
    setPieceOnBoard(): boolean {
        const selectedPiece = this.rootStore.boardsStore.selectedPiece
        const highlighted = this.highlightedPair
        if (!highlighted || !selectedPiece) return false

        const [[i, j], [i2, j2]] = highlighted
        if (this.board[i][j] != null) return false

        if (selectedPiece == 1) {
            if (i > i2) { this.board[i2][j2] = 1; this.board[i][j] = 0 }
            else { this.board[i][j] = 1; this.board[i2][j2] = 0 }
        } else if (selectedPiece == 2) {
            if (j > j2) { this.board[i2][j2] = 0; this.board[i][j] = 2 }
            else { this.board[i][j] = 0; this.board[i2][j2] = 2 }
        }
        return true
    }

    /**
     * One click on the board, routed by what is under the pointer: an occupied cell
     * removes its domino, an empty one places the selected piece.
     *
     * Removal used to live on the piece overlay's own click handler (spec D4). That
     * overlay is 16px taller than its cell and shifted up, so its hit region reached 12px
     * into the *empty cell above* -- clicking there deleted the domino a player was
     * trying to build on top of. The overlay is now inert and the decision is made here,
     * from a single cell index, so a piece can never claim a click outside its own cell.
     *
     * Returns whether the board changed; callers use it for feedback and undo (P1-3/P1-4).
     */
    activateHoveredCell(): boolean {
        const cell = this.hoveredCell
        if (!cell) return false
        const [i, j] = cell
        // Occupied -- a domino half or a rock -- means this click is a removal attempt,
        // never a placement. Rocks resolve to no pair, so clicking one does nothing.
        if (this.board[i][j] !== null) return this.removePiece(i, j)
        return this.setPieceOnBoard()
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

    /**
     * Remove the domino occupying (i,j), from either of its halves.
     * Returns whether anything was removed; callers use it for feedback and undo.
     */
    removePiece(i: number, j: number): boolean {
        const pair = this.pairAt(i, j)
        if (!pair) return false // rejected: nothing is mutated

        const [[ai, aj], [bi, bj]] = pair
        this.board[ai][aj] = null
        this.board[bi][bj] = null
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
     * Pure: the stored `completed` flag is written only by LevelStore's autorun.
     */
    get completedByRules() {
        return this.isBoardFull && this.targetsMatch
    }

    setCompleted(isCompleted: boolean) {
        this.completed = isCompleted
    }
}
