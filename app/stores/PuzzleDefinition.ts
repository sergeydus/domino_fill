import type { DominoLevel } from "../dominoFill/dominoBoard";

/**
 * The immutable half of a puzzle: rocks, targets, and identity.
 *
 * A definition is frozen and never mutated by gameplay — it is the source that a
 * `PuzzleSession` clones from. Keeping it separate from play state is what stops moves and
 * completion flags from writing back into the imported JSON module.
 */
export type PuzzleDefinition = {
    /** Stable, opaque, and frozen for the life of the puzzle. Minted into the data file. */
    readonly puzzleId: string
    /** Content fingerprint. Identity is `puzzleId`; this only detects that content changed. */
    readonly definitionHash: string
    readonly size: number
    /** Rocks (-1) and empty cells (null). Never contains placed pieces. */
    readonly initialBoard: readonly (readonly (number | null)[])[]
    /**
     * Targets, named for what they actually are.
     *
     * The stored JSON calls these `boardHorizontalNumbers`/`boardVerticalNumbers`, but
     * "horizontal" holds the per-COLUMN sums (rendered along the top) and "vertical" the
     * per-ROW sums. The inverted names stop at the data boundary: `StoredPuzzle` keeps
     * them for file compatibility, everything inside uses these.
     */
    readonly columnTargets: string
    readonly rowTargets: string
}

export type StoredPuzzle = DominoLevel & { puzzleId: string }

/**
 * Small stable string hash (FNV-1a). Not cryptographic — it only needs to change when the
 * definition's content changes, so a stored session can be invalidated rather than loaded
 * against a puzzle it no longer matches.
 */
const hash = (input: string): string => {
    let h = 0x811c9dc5
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
}

/** Strip any placed pieces, keeping only rocks and empties, so the definition is canonical. */
const toInitialBoard = (board: (number | null)[][]): (number | null)[][] =>
    board.map(row => row.map(cell => (cell === -1 ? -1 : null)))

export const definitionFrom = (stored: StoredPuzzle): PuzzleDefinition => {
    // Required, not defaulted. A generated id would be positional, so reordering or
    // extending the data file would silently re-point every saved session.
    if (!stored.puzzleId) {
        throw new Error('PuzzleDefinition requires a puzzleId; none found on the stored puzzle')
    }
    const initialBoard = toInitialBoard(stored.board)
    const definitionHash = hash(JSON.stringify([
        initialBoard,
        stored.boardHorizontalNumbers,
        stored.boardVerticalNumbers,
    ]))

    return Object.freeze({
        puzzleId: stored.puzzleId,
        definitionHash,
        size: initialBoard.length,
        initialBoard: Object.freeze(initialBoard.map(row => Object.freeze(row))),
        columnTargets: stored.boardHorizontalNumbers,
        rowTargets: stored.boardVerticalNumbers,
    })
}

/** A fresh, mutable board for a session to own. Never aliases the definition. */
export const cloneInitialBoard = (definition: PuzzleDefinition): (number | null)[][] =>
    definition.initialBoard.map(row => [...row])
