import { useStores } from "@/app/hooks/useStore";

const Tutorial = () => {
    const boardsStore = useStores();

    // useEffect(() => {
    //     boardsStore.setTutorial(true);
    //     return () => {
    //         boardsStore.setTutorial(false);
    //     };
    // }, []);

    return null
    // return (
    //     <div className="absolute w-full h-full top-0 left-0 flex flex-col items-center justify-center pointer-events-none z-999">
    //         {/* <div className="absolute top-0 left-0 right-0 bottom-0 backdrop-blur-sm">
    //         <h1>Tutorial</h1>
    //         <p>Click on the board to place a domino.</p>
    //         </div> */}
    //     </div>
    // );
};

export default Tutorial;
