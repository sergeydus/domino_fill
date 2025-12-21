import { getCurrentActiveBoard } from './Boards'
import DominoClient from './DominoClient';
export default function Home() {
  const board = JSON.parse(JSON.stringify(getCurrentActiveBoard()))
  console.log('boards', board)

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-[#e8e7e7] font-sans">
      <DominoClient />
    </div >
  );
}
