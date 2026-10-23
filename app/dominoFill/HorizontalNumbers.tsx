import { observer } from "mobx-react"
import { PuzzleSession } from "../stores/PuzzleSession"
import { ColumnLabels } from "./LineLabels"

/**
 * The column labels, along the top of the board: the session's targets and states, passed to
 * the one renderer (`LineLabels`, UI row 4) and nothing else, so what the sheet's fixtures
 * measure of that renderer is what the board draws.
 */
const HorizontalNumbers: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => (
    <ColumnLabels
        targets={boardsStore.definition.columnTargets.split(',')}
        states={boardsStore.columnStates}
        cell={boardsStore.squareSize}
        gutter={boardsStore.gutterSize}
    />
)
export default observer(HorizontalNumbers)
