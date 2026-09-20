import DominoClient from './dominoFill/DominoClient';

/*
 * The page renders the client and nothing else.
 *
 * It used to call `getCurrentActiveBoard()` -- without awaiting it -- and `JSON.parse`
 * a stringified promise into a variable nothing read. The content now arrives in the
 * browser from a static chunk (row 18d), so there is nothing for a server component to
 * fetch here. This was also the repository's only lint warning.
 */
export default function Home() {
  return (
    <div className="flex flex-col min-h-svh bg-[#e8e7e7] font-sans">
      <DominoClient />
    </div >
  );
}
