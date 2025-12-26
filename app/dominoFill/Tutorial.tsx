import { useStores } from "@/app/hooks/useStore";
import { useLocalhost } from "../hooks/useLocalhost";
import React, { useState } from "react";
// import { TutorialStore } from "../stores/TutorialStore";
import ClientBoard from "./ClientBoard";
import { cn } from "../utils";
import { observer } from "mobx-react";
import { CurrentBoardStore } from "../stores/CurrentBoardStore";

const Tutorial = () => {
    const { boardsStore } = useStores();
    const [tutorialBoard,] = useState(new CurrentBoardStore({ board: [[null, null], [null, null]], boardHorizontalNumbers: '11', boardVerticalNumbers: '20', completed: false }, boardsStore.rootStore));
    const [hasSeenTutorial, setHasSeenTutorial] = useLocalhost('hasSeenTutorial', false);
    // useEffect(() => {
    //     boardsStore.setTutorial(true);
    //     return () => {
    //         boardsStore.setTutorial(false);
    //     };
    // }, []);
    if (hasSeenTutorial) {
        return null
    }
    // if (!boardsStore.currentBoard) {
    //     return null;
    // }
    return (
        <div className="absolute w-full h-full top-0 left-0 flex flex-col items-center justify-center z-999">
            <div className="absolute top-0 left-0 right-0 bottom-0 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-white rounded-2xl text-black w-[min(90%,1080px)] p-8 flex items-center justify-center flex-col gap-4">
                    <h2 className="text-3xl font-bold mb-4">Domino Fill Tutorial</h2>
                    {/* complete:{tutorialBoard.completed ? 'yes' : 'no'} */}
                    <p>Welcome to Domino Fill! The goal of the game is to fill the entire board with domino pieces.</p>
                    <p>Each domino piece covers two adjacent squares on the board.</p>
                    <p>The numbers on the edges of the board indicate how many domino pieces should be placed in that row or column.</p>
                    <p>Use the slider to adjust the difficulty level, which changes the size of the board and the complexity of the puzzle.</p>
                    <p>Right-click to switch between the two types of domino pieces.</p>
                    <p>Click on the board to place a domino.</p>
                    <ClientBoard boardsStore={tutorialBoard} />
                    <button disabled={!tutorialBoard.completed} className={cn({ "mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer": true, "opacity-50 cursor-not-allowed": !tutorialBoard.completed })}
                        onClick={() => {
                            // console.log('asd', boardsStore.currentBoard)
                            setHasSeenTutorial(true);
                            boardsStore.setHasSeenTutorial(true);
                            // boardsStore.setTutorial(false);
                        }}>
                        Got it!
                    </button>
                    {/* <ClientBoard boardsStore={tutorialStore}/> */}
                </div>
            </div>
        </div>
    );
};

export default observer(Tutorial);
