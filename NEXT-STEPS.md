# Domino Fill: what's next

2026-09-28 · proposals after the graphics spec (rows 1–16) closed at `9eddbb8`

The goal is to keep Domino Fill a calm daily puzzle for casual players, and to add an opt-in
timed mode that is fast and fair enough for speedrunners. Every idea below has a **Decision**
column. Fill it in with Yes, Later or No, and the Yes rows become the next plan.

Evidence levels follow the review convention:
- **measured**: a number from a run;
- **read**: seen in the code at the file named;
- **inferred**: a reasonable guess that hasn't been tested.

## Goal

The game has one set of puzzles and two ways to play it, and neither way gets in the other's
way.

- **Casual players** get a calm daily puzzle, with hints, forgiving controls and no clock.
- **Speedrunners** get the same puzzles as everyone else, a precise timer, and controls that
  never slow a run down.

Every idea is judged by four principles:

1. **Casual play is the default.** It changes only when the change is better for casual
   players too.
2. **Speed features are opt-in**, behind one timed-mode toggle.
3. **The controls keep one verb.** A drag, a tap and an arrow key all mean "this cell, that
   direction". There is no rotate button and no mode.
4. **Both audiences play the same puzzles.** The fixed daily corpus, with one set of puzzles
   per date, is the shared ground.

## Controls

Making Reset undoable matters most, because today one misclick can wipe a nearly finished board
with no way back. The suggested order is 1, 3, 2, 4, with 5 arriving alongside timed mode.

| # | Idea | Why | Helps | Effort | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | Undo reverses Reset | Reset clears the board and the undo history, with no confirmation, and it sits next to Undo (read: `app/stores/PuzzleSession.ts` `reset()` sets `moves = []`). Undo would restore the board. A confirm prompt would do the same job but slow runs down. | Both | Small, about an afternoon | |
| 2 | Shift+Arrow places a domino in one keystroke | Placing from the keyboard takes three presses: an arrow to reach the cell, Space, then an arrow for the direction. Shift is unused on the board today (read: `keyOnBoard` returns `false` for any modifier). | Speedrunners, keyboard players | Small | |
| 3 | Shortcuts: H for Hint, C for Check, R for Reset, and redo | The buttons have no keys, and redo doesn't exist. Redo would go on Ctrl+Shift+Z and Ctrl+Y. The shortcuts would be shown in tooltips and in the tutorial. | Both | Small, about an afternoon | |
| 4 | Drag a placed domino to move it | Dragging a placed piece does nothing now, so you tap it off and place it again (read: `pointerUp` refuses a drag whose starting cell is occupied). Dropping the piece off the board would remove it. | Casual | Medium. It changes how dragging works, so it needs its own review | |
| 5 | Place during a drag, in timed mode only | A drag places on release (read: `pointerUp`). Placing as the pointer crosses into the neighbouring cell saves time. Casual play keeps release-to-place, so you can change your mind mid-drag. | Speedrunners | Small, once timed mode exists | |

Some controls should stay as they are:
- a tap places the domino at once when only one direction fits;
- tapping a placed piece removes it;
- there is no rotate button and no piece picker.

## Timed mode

Start with classic speedrunning: known puzzle sets, practice allowed, and times verified by
video on a site like speedrun.com. It needs no server. A live daily race with public
leaderboards is a different and much bigger project.

| # | Idea | What it means | Effort | Decision |
| --- | --- | --- | --- | --- |
| 1 | Timed-mode toggle | Off by default. It turns on the timer and the timed rules, and leaves casual play untouched. | Small | |
| 2 | Timer | Uses the browser's high-precision clock, not the wall clock. It stops on the placement that completes the board. When it starts is an open question. | Small | |
| 3 | Personal bests | Saved per category in their own storage, which the 14-day progress cleanup never removes (read: `RETENTION_DAYS = 14` in `app/stores/progressStorage.ts`). | Small | |
| 4 | Hint rule | Hints are either off in timed mode, or runs that use them form their own category. | Small | |
| 5 | No-click flow | A solved puzzle goes straight to the next one, with no completion card to dismiss, and there is an instant-reset key. Also check that no animation blocks input. Every duration in `app/dominoFill/motion.ts` is 0.2 s or less (read), but nobody has checked whether any of them block input. | Small to medium | |
| 6 | Categories and splits | A run is one puzzle, one difficulty (3 puzzles) or a whole day (9 puzzles), on any archive date, so everyone plays the same set. Each puzzle gets a split time. | Medium; items 1–3 together take a few days | |
| 7 | Run log and replay | Every move is recorded with its time and can be exported. Anyone could replay a run, and a server could check that its moves were legal, though not how fast a human made them. | Medium | |
| 8 | Leaderboards | Needs a server that holds future puzzles back. Today every day through 2036-08-31 is a public static file under `public/puzzles/`, and the solver ships in the app, so anyone could solve tomorrow's puzzles in advance (read). | Large, a real project | |

## Puzzle quality

The current generator makes exactly the same puzzles as the original. It is much faster, but
the puzzle design itself hasn't improved.

The measurement ran the original `dominoBoard.ts` (the version before `3ca2bdc`) against
`scripts/generate-boards.ts` on 225 identical rock layouts, 25 for each of the corpus's 9
slots:
- the two produced the same puzzle in 69 of 69 cases, and both found nothing on the other 156
  layouts;
- on 8×8 boards with 6 rocks, the original averaged 4.4 s (worst 26.5 s) and the current code
  averaged 9 ms (worst 49 ms).

| # | Idea | Why | Effort | Decision |
| --- | --- | --- | --- | --- |
| 1 | Rate difficulty by how hard a puzzle is to solve | Difficulty is only board size and rock count (read: `SLOTS` in `scripts/corpus.ts`). Each puzzle would be graded by the solver's work, or by the deductions a person would need, and the levels ordered by that grade. | Medium to large | |
| 2 | Remove the lean towards vertical pieces | In the measured runs, 58 to 78% of pieces were vertical, depending on the slot. The likely cause is that the search tries vertical first and keeps the first unique answer (inferred, untested). The fix is to try both orientations in random order. | Small to build | |
| 3 | A wider difficulty ramp | The three levels of a difficulty differ only by 2 rocks each (read: `SLOTS`). | Medium | |

Any of these changes future puzzles. Every date through 2036-08-31 is already published, and
the build refuses to change a published date (read: the append-only rule in
`scripts/corpus.ts`). So these ideas need a decision first; see the open questions.

## Archive

The archive's day colours currently fade after two weeks, which makes it a poor long-term
record of what you've played.

| # | Idea | Why | Effort | Decision |
| --- | --- | --- | --- | --- |
| 1 | Keep finished days marked | Progress untouched for 14 days is deleted, so a day finished last month shows as "not played" (read: `isExpired` and `markForDay`). A tiny completion flag per day would be kept indefinitely. | Small | |
| 2 | Month names | The heading reads "2026-09" rather than "September 2026" (read: `app/dominoFill/Archive.tsx`). | Small | |
| 3 | Progress on other devices | Progress lives in one browser's local storage. Syncing it needs accounts and a server. | Large | |

## Upkeep

The graphics work is finished and reviewed, but nobody has play-tested it yet, and the codebase
is heavier than a puzzle game needs.

| # | Idea | Why | Effort | Decision |
| --- | --- | --- | --- | --- |
| 1 | Play it on a phone for a few days | Every visual change was checked against the spec and against pixel baselines, not against people. Whether the game is beautiful or fun is still open. | A few days of playing | |
| 2 | Merge `feature/dominofit-spec-upgrades` into master | The branch is 101 commits ahead. Every row passed review and CI. | Small | |
| 3 | Trim the longest comments | About 3,500 of the app's 8,148 lines are comments, many of them essay-length (measured). They help review, but they slow down reading and changing the code. | Medium | |
| 4 | Fold the spec amendments into a short design note | `GRAPHICS-SPEC.md` and `SPEC.md` total about 4,300 lines (measured), and much of that is correction records. | Medium | |
| 5 | A lighter process for small changes | Two commits per visual change, the full gate and a review round suited a careful rebuild, but they are heavy for a hobby game. Tests run to about 22,700 lines, nearly three times the size of the app (measured). | A decision, no code | |
| 6 | Tighten the archive's viewed-day ring | This was codex's optional note from row 14: the ring on the day being viewed is styled for any `aria-current` value, not only `"date"`. It is not a live bug. | Small | |

## Open questions

- [ ] **When does a run's clock start?** Either at the first move, or when the board appears.
  Most puzzle speedrun communities start the clock when the board appears, so reading the
  board counts.
- [ ] **Leaderboards ever, or only video-verified runs?** Leaderboards need a server that keeps
  future puzzles secret.
- [ ] **May future puzzles change?** Every date through 2036-08-31 is published, and the build
  refuses to change a published date. Better puzzles means either allowing changes to dates not
  yet reached, or waiting until 2036.
- [ ] **Which audience comes first?** Either the casual fixes (undoable Reset, lasting archive
  marks) or timed mode.
