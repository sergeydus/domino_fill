import { observer } from "mobx-react"
import { PuzzleSession } from "../stores/PuzzleSession"
import { RowLabels } from "./LineLabels"

/**
 * The row labels, down the left of the board (spec P0-3): the session's targets and states,
 * passed to the one renderer (`LineLabels`, UI row 4) and nothing else.
 *
 * One gutter, not two: this used to be rendered twice, and the duplicate right-hand copy
 * cost a whole column of width on the one device with none to spare.
 */
const VerticalNumbers: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => (
    <RowLabels
        targets={boardsStore.definition.rowTargets.split(',')}
        states={boardsStore.rowStates}
        cell={boardsStore.squareSize}
        gutter={boardsStore.gutterSize}
    />
)
export default observer(VerticalNumbers)
