import DominoClient from './DominoClient';

/** As `app/page.tsx`: the client fetches its own content (row 18d). */
export default function Home() {
  return (
    <div className="flex flex-col min-h-svh bg-[#e8e7e7] font-sans">
      <DominoClient />
    </div >
  );
}
