import { observer } from "mobx-react"
import { useStores } from "../hooks/useStore"
import { i } from "motion/react-client"

const Hover: React.FC = () => {
    // console.log('wrapper rerender')
    const { boardsStore } = useStores()
    const highlightedSquares = boardsStore.highlightedSquares2
    const size = boardsStore.squareSize
    if (!highlightedSquares) return null

    const [[i1, j1], [i2, j2]] = highlightedSquares
    const startI = Math.min(i1, i2)
    const startJ = Math.min(j1, j2)
    // console.log('hover',{ top: `${i1 * 96}px`, left: `${j1 * 96}px` })
    return <>
        {/* <div className="z-10 pointer-events-none absolute opacity-70 bg-white" style={{ top: `${i1 * size}px`, left: `${j1 * size}px`, height: `${size}px`, width: `${size}px`, borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}></div>
        <div className="z-10 pointer-events-none absolute opacity-70 bg-white" style={{ top: `${i2 * size}px`, left: `${j2 * size}px`, height: `${size}px`, width: `${size}px`, borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}></div> */}
        <div className="z-10 pointer-events-none absolute opacity-70 bg-white" style={{ top: `${startI * size}px`, left: `${startJ * size}px`, height: `${size * (Math.abs(i1 - i2) + 1)}px`, width: `${size * (Math.abs(j1 - j2) + 1)}px`, borderTopLeftRadius: '12px', borderTopRightRadius: '12px', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}></div>
    </>
}
export default observer(Hover)