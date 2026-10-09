# Domino Fill: what's next

2026-09-28, updated 2026-10-09 · proposals after the graphics spec (rows 1–16) closed at
`9eddbb8`; merged to master as PR #1 (`f2f919b`)

Domino Fill stays a calm daily puzzle, and gains a LinkedIn-style **Daily Challenge**:
- all nine of the day's boards, 6×6, 7×7 and 8×8, each covered until started;
- one attempt per board, timed;
- a time per board and a total per size, to share.

Days before yesterday, in the archive, are the casual, clock-free game.

**There are no servers**, so every competitive feature here works on one device, on the
honour system, and there is no rank. That is why it's called a challenge. Leaderboards and
percentiles are recorded under [Would need a server](#would-need-a-server-rejected) as rejected.

Each idea appears once, in one table. Fill its **Decision** cell with Yes, Later or No, and the
Yes rows become the next plan. Rows marked *(codex)* come from codex's reviews; its notes on the
other rows are folded into them.

**Nothing in the Daily Challenge or the new input schemes should be built yet** (codex,
2026-09-29). Their open questions come first. The casual fixes (Controls 1, A1, A2) don't
depend on them.

Evidence levels:
- **measured**: a number from a run;
- **read**: seen in the code at the file named;
- **reported**: from a published source listed at the end;
- **inferred**: a reasonable guess that hasn't been tested.

## Decisions so far

| Date | Decision | Consequence |
| --- | --- | --- |
| 2026-09-28 | Competition works like LinkedIn's timed games: a fresh daily puzzle, first attempt counts. | This rewards **solving an unseen puzzle**, not practised speed on a known one. It replaces the earlier speedrun.com-style plan. |
| 2026-09-28 | No servers. | Times live on the player's device and are compared by sharing. They are unverified: the challenge boards are in the public repo before their day, and a second browser gives a second attempt. Leaderboards, percentiles and sync are rejected, not deferred. |
| 2026-09-28 | The challenge is the day's three 8×8 boards (Hard levels 1–3). | The other six boards stay casual. *Superseded 2026-10-09: all nine boards.* |
| 2026-09-28 | The clock starts only when a board is revealed. | Loading and reading the menu never count. See D3. |
| 2026-09-28 | The result is one total: the three boards' times added up, with a split per board. | One number to share and beat. See D1. *Superseded 2026-10-09: a time per board and a total per size.* |
| 2026-09-28 | The boards are played in order: Hard 1, then 2, then 3. | Every player's run is the same. *Superseded 2026-10-09: any order.* |
| 2026-09-28 | Using a hint on a challenge board means the day's result doesn't count. | This was decided as "unranked". The boards can still be finished; the total is kept, marked as assisted. See D2. *Superseded 2026-10-09: a hint costs that board's time only.* |
| 2026-09-28 | Undo and Reset stay allowed on challenge boards. | They cost time, which is their own penalty. |
| 2026-09-28 | Streaks, yes. One challenge board solved in a day keeps a streak alive. | See D9. |
| 2026-09-28 | Streak freeze: one earned for every 3 days played, at most 3 saved. | A freeze is used on a missed day. See D9. |
| 2026-09-28 | No keyboard shortcuts. | Controls 2 and 3 are No. Keyboard *play* stays as it is (arrows, Space, Enter, Delete, Escape, Ctrl/Cmd+Z), because it's how the game is played without a mouse or touch. |
| 2026-09-28 | Merge the branch. | Done via PR #1, merge commit `f2f919b`. Every row commit stays in master's history. |
| 2026-09-29 | Call it the **Daily Challenge**, not "Daily Ranked" (codex). | With no server there is no rank, and the name shouldn't promise one. |
| 2026-09-29 | Add a **Pick a piece** control mode, as in Domino Fit: a held piece, and a click places it wherever the held piece can cover the clicked cell. | PL1 and PL2 are Yes. The behaviour is the one shown in the [Pick-a-Piece Placement](https://claude.ai/artifact/425vtQVmfBrJJTjpZtkq64) example; its written rule is under PL1 and PL2, and the implementation contract below them. |
| 2026-09-29 | In Pick a piece mode, the held piece governs taps and clicks only. The mode switch sits beside Sound. | A drag keeps today's directional placement. The switch moves only if it doesn't fit the tested layouts. Codex reviews the contract before any code is written. |
| 2026-10-02 | Merge PR #3, the chips. | The user's visual sign-off on the preview ("pick a piece looks good"). Merge commit `3ba330f`. |
| 2026-10-02 | In Pick a piece mode, the clicked square takes the piece's **numbered half**: an upright's 1, a flat's 2. | It was the top or left half, which put the 1 under the cursor upright and the blank half under it flat. The user asked why the two differed, and chose the number over the position. See PL2. |
| 2026-10-04 | No Redo ("seems unnecessary"). | Controls 8 is No, against codex's recommendation, so SPEC P1-3's "No redo, deliberately" stands. A contract was drafted and reviewed by codex, and isn't kept. |
| 2026-10-09 | Reset stays as it is: no confirmation, no notice. | Controls 6 is No. Undo takes a Reset back, and the user tried it. A Reset still can't be undone after a reload. |
| 2026-10-09 | The Daily Challenge is **all nine** of the day's boards: 6×6, 7×7 and 8×8, three levels each, every one timed. | Each board is covered until the player presses Start, which reveals it and starts its clock (D3). Supersedes the three-8×8 set. See D1. |
| 2026-10-09 | Today's boards are always timed. There's no untimed way to play them. | Clock-free casual play is the archive's earlier days. Principles 1 and 2 change. |
| 2026-10-09 | The result is a time per board, and a total per size. | A size's total is its three boards' times added up, so finishing one size is a complete result even if the others are skipped. A size with a board unsolved: see the partial-result row below. |
| 2026-10-09 | The boards can be played in any order. | Each board has its own clock, so the time between boards never counts. |
| 2026-10-09 | Yesterday's boards are timed too, like today's. | D8's window: a date's challenge can be started while it is today or yesterday on the player's device, so friends whose dates differ by one can play the same date. The archive before yesterday is casual. |
| 2026-10-09 | A hint costs that board's time only. | The board can still be finished, marked as hinted, with no time. Its size has no total that day; the other sizes are unaffected. |
| 2026-10-09 | Check counts like a hint. | It tells the player something about the solution. |
| 2026-10-09 | A size with a board unsolved or given up shows a partial result. | Solved boards keep their times, and the size shows "partial" instead of a total. Any solved board keeps the streak alive, hinted or checked ones included. |
| 2026-10-09 | No give-up button. | A started board left unfinished counts as given up when its date leaves the today-or-yesterday window; its clock runs until then. |
| 2026-10-09 | Replays inside the window are timed Practice. | Labelled everywhere, they never change the first attempt's result. See D5. |
| 2026-10-09 | A streak freeze is earned by days that keep the streak. | A "day played" is a day with a challenge board solved. See D9. |

## Principles

1. **Casual play is the archive.** Days before yesterday are never timed, and a player who
   plays only them never sees a clock or a streak. Changes to casual play must be better for
   casual players too. *(Changed 2026-10-09: it was "casual play is the default". Today's
   and yesterday's boards are now always timed.)*
2. **The challenge is all nine of the day's boards.** They're the same boards for everyone on
   a date, each covered until the player starts it, and only the first attempt counts.
   *(Changed 2026-10-09: it was the three 8×8 boards, opt-in.)*
3. **The default controls keep one verb.** A drag, a tap and an arrow key all mean "this
   cell, that direction", with no mode to forget. Faster schemes, such as a selected piece,
   are opt-in alternatives in settings, never the default. No scheme overrides a choice the
   player has expressed (see
   [Faster and alternative placement](#faster-and-alternative-placement)).
4. **Published puzzles never change.** The archive and saved boards stay valid. New kinds of
   content arrive as a new track.
5. **Say what a time proves.** A time measured in a browser proves nothing about who solved the
   board or how. The game never calls such a time verified.

## Daily Challenge: LinkedIn-style, without a server

LinkedIn's model (reported):
- **one puzzle per game per day**, the same for everyone;
- **one attempt**. Results differ by game:
  - the logic games (Queens, Tango, Zip) are timed, and the result is the clock reading at
    the finish;
  - Pinpoint is scored by how many clues you revealed (codex).
- **rankings**:
  - against your connections (opt-in, shown once enough of them play);
  - the top 50 companies and schools, by their members' average;
  - percentiles, such as "Smarter than 90% of CEOs".
- **streaks** with milestones, a **share** button, and nudges to connections who haven't
  played.

Without a server we can build everything except the rankings.

| LinkedIn feature | Domino Fill, with no servers |
| --- | --- |
| Same daily puzzle | Yes: the corpus already maps each date to the same boards (read). |
| One timed attempt | Yes, enforced on the device. Cleared storage or another browser gets another try. |
| Rank among connections | No rank. Friends compare shared result cards. |
| Company and school ranking | No. |
| Percentile against all players | No. |
| Streaks | Yes, on the device. |
| Share | Yes, a result card. |

**The attempt boundary** (codex): today's boards are reachable through the difficulty and
level selectors (read: `app/dominoFill/DominoClient.tsx`). So "first attempt on an unseen
puzzle" needs every route to a board to show it covered until Start. Since 2026-10-09 all nine
are timed with no untimed way in, so there's no casual first look to rule on (D1).

| # | Idea | What it means | Effort | Decision |
| --- | --- | --- | --- | --- |
| D1 | The Daily Challenge set | All nine of the day's boards: Easy (6×6), Medium (7×7) and Hard (8×8), levels 1–3 each, played in any order. Each is covered until the player presses Start, and every one is timed: there's no untimed way to play today's boards. The result is a time per board and a total per size. *(Changed 2026-10-09: it was the three 8×8 boards in order, one total, with "Play untimed" as the way around it.)* | Medium to large | Yes (user, 2026-10-09) |
| D2 | Ruleset v1, written first *(codex R1)* | Define start, finish, first-attempt rule, assists, reload, a hidden tab and errors, before any time is saved. Decided so far: Undo and Reset are allowed; a hint, or a Check, costs that board's time only, and the board can still be finished, marked as hinted; a size with a board unsolved or given up shows a partial result, not a total (user, 2026-10-09). There's no give-up button: a started board left unfinished counts as given up when its date leaves the today-or-yesterday window, and its clock runs until then (user, 2026-10-09). D2 must also say what happens to boards already seen or played before the challenge ships: they can't honestly become unseen first attempts (codex). Store the ruleset version with every result, so a later change never reinterprets old times. | Design first | |
| D3 | The clock starts at the reveal *(codex R2)* | Each challenge board loads covered; pressing Start reveals it and starts its clock in the same step, so loading time never counts. Each board has its own clock, so the time between boards never counts. | Medium | Yes |
| D4 | A clock that survives a reload | `performance.now()` suits elapsed time within one page, but it restarts on reload (codex, citing the W3C spec). The attempt's start is therefore saved as a wall-clock time, so reloading never restarts the attempt. Changing the device clock mid-attempt could still alter the time, which is accepted under the honour system. | Small | |
| D5 | First attempt only, practice after *(codex R3, C2)* | Once a challenge board is revealed, that attempt is its result. Replays are Practice copies, labelled everywhere, never overwriting the result or completion mark. Inside the today-or-yesterday window a Practice replay is timed too, since those boards have no untimed play (user, 2026-10-09). Archive puzzles outside the window are casual and untimed (D8). | Medium | Yes (user, 2026-10-09) |
| D6 | Personal stats | Today's time, best, average, the last 30 days and a solved count. They get their own storage, which the 14-day progress cleanup never removes (read: `RETENTION_DAYS = 14` in `app/stores/progressStorage.ts`). | Small | |
| D7 | Share card *(codex C4, R10)* | A spoiler-free result: the date, the time, whether assists were used, and a link to that date's challenge. Casual players can share a solve without a time. It never posts automatically. | Small to medium | |
| D8 | Challenge link and window *(codex R8)* | "Today" is the player's local day (read: `DominoClient.tsx` loads the day from `dayKey(new Date())`), so a friend's today can be your yesterday (codex). **Proposed:** a date's challenge can be started, as a first attempt, while that date is today or yesterday on the player's device. The window is two calendar dates on the player's device, not exactly 48 hours, and it doesn't cover every pair of time zones: at the same instant a UTC+14 player can be two dates ahead of a UTC−12 one, whose device refuses the link as a future date (codex). It covers friends whose dates differ by at most one. Links name an explicit date, and future dates are refused, even though their files are public. Since today is always timed, yesterday's boards inside this window are covered and timed too (user, 2026-10-09). | Small to medium | Yes (user, 2026-10-09) |
| D9 | Streaks *(codex C7)* | Consecutive days with at least one challenge board solved (a hinted or checked solve counts; user, 2026-10-09), plus milestones, as LinkedIn does. Proposed: they use D8's window, so a player who solves yesterday's board just after midnight keeps their streak. Codex's caution still applies, since pressure fights calm play. So no streak is shown to players who never play the challenge. A streak freeze is earned for every 3 days played (days that keep the streak), at most 3 are saved, and one is used automatically on a missed day. | Small to medium | Yes |
| D10 | Finish without blocking *(codex R6)* | The clock stops on the winning placement. The result appears without blocking input and is announced once to screen readers. There is no auto-advance in casual play. Also check that no animation blocks input: every duration in `app/dominoFill/motion.ts` is 0.2 s or less (read), but blocking hasn't been checked. | Medium | |
| D11 | Run receipt *(codex R4)* | Export the puzzle ID, definition hash, ruleset version, time and move log. It's useful for replay and settling disputes among friends, but proves the moves, not who made them or how fast. | Medium | |
| D12 | Previous-best comparison *(codex R7)* | A split against your own best, only on challenge boards, with a switch to hide it. | Medium | |
| D13 | Test the timer on real devices *(codex R9)* | Background tabs, sleep and wake, phone lock, reload and clock changes, on real phones and browsers. | Study first | |
| D14 | Input fairness study *(codex R5)* | Compare mouse, touch and keyboard times before adding faster controls. If one input is much faster, decide whether to note the input on the share card. | Study first | |
| D15 | Speedrun categories on archive puzzles | The earlier plan: fixed sets, splits and video-checked runs. It's superseded as the main competition, but could return as an extra. | Medium | |

### Ruleset v1 (D2): contract draft, for codex's review

**Why.** A time means nothing until the rules that produced it are fixed, so they're written
before any time is saved (codex R1). This is the rules only, not the screens: covering,
the clock's display, the result card, stats, sharing and streak UI come after, against it.
Drafted 2026-10-09 from the user's decisions above. Codex's first review (2026-10-09): six
corrections, all made below (two tabs, saving assists and failures, expiry without a fetch,
Undo after a win, clock errors, the legacy rule). Two rules are proposals awaiting the user,
marked **Proposed**; codex supports both in principle. No implementation until approved.

**How it works today** (read):
- A date's nine boards have ids from `puzzleIdFor(date, group, level)` (`scripts/corpus.ts`),
  so a board belongs to exactly one date.
- "Today" is the device's local date (`dayKey`, `app/stores/progressStorage.ts`). A new day's
  boards arrive by a refetch (`useDayRollover`), which can fail offline, and a tab may
  deliberately keep the board it's on.
- Progress is one `localStorage` key per puzzle: the board, `completed`, the definition's
  hash and `savedAt`, the time it last changed. A record is written only when the board
  changed (`persist` in `BoardsStore.ts`), so a board that was only looked at has none.
  Same-puzzle writes from two tabs are last-write-wins. Records untouched for 14 days are
  deleted (`RETENTION_DAYS`).
- Nothing is timed, nothing records Hint or Check use, and nothing coordinates tabs.

**The rules**
1. **Which boards.** All nine boards of a date are challenge boards while the device's date
   is that date or the day after. From then on they're archive boards: casual and untimed,
   as every older date is now. Eligibility is always computed from the board's date and the
   device's date *now*, never from which boards the app has fetched (codex).
2. **Covered until Start.** A challenge board with no attempt shows covered: no cells, rocks
   or line targets. Start is offered only once the board has loaded, and pressing it reveals
   the board and starts its clock in the same step (D3). Every route to the board (the
   selectors, Next on the completion card, the archive, a reload) shows it covered until then.
3. **One attempt per board, per device.** Start begins the board's attempt, and the attempt
   is its result. Cleared storage or another browser gets another attempt: the honour system
   (Principle 5).
4. **The clock.** Start saves the attempt's start as a wall-clock instant (`Date.now()`)
   *before* the board is revealed, so a reload resumes the clock and never restarts it (D4).
   The clock never pauses: a hidden tab, a locked phone, a reload or a closed browser all
   count. **If saving the start fails**, the board stays covered and Start offers a retry:
   the board is never revealed without a saved start (codex).
5. **Clock errors.** A device clock moved backwards is detected in two ways only: the finish
   is earlier than the start, or, while the page is open, the wall clock advanced by less
   than the page's monotonic clock (`performance.now()`) beyond a small tolerance. Only that
   direction is checked: sleep can stop the monotonic clock, which makes the wall clock look
   *ahead*, never behind. **Proposed:** a detected error gives *solved, time unavailable
   (clock error)*: the solve counts, with no time. A change made while the game is closed,
   or forwards, isn't detected and can alter a time; that's accepted under the honour system
   (Principle 5). The game doesn't claim to catch every clock change (codex).
6. **The finish.** The placement that solves the board by the rules stops the clock, and the
   time is that placement's instant minus the start. It's accepted as the attempt's result
   only if, at that instant, the board's date is still inside the window and the attempt has
   no result yet (rules 1 and 8). Once fixed, the result never changes.
7. **Assists.** Using Hint or Check during an attempt marks it *assisted*, and the flag is
   saved *before* the hint or answer is shown, so Reset, leaving the board, or a reload
   never clear it (codex). If it can't be saved, the hint isn't given. The board can still be
   finished, and shows as solved with a hint, with no time. Undo and Reset are free: they
   cost only time.
8. **Giving up.** There's no give-up button. An attempt still unsolved when its date leaves
   the window (for a board dated the 9th, at local midnight starting the 11th) is *given up*,
   with no time. Its clock runs until then. Expiry doesn't wait for a fetch: every open of
   the app, and every finish, first settles any attempt whose date has left the window as
   given up (codex). A board solved after that, in a tab left open or offline, is a casual
   solve and never turns a given-up attempt into a result.
9. **A board's result** is one of: not started; in progress; solved, with a time; solved
   with a hint (no time); solved, time unavailable (clock error); given up (no time).
10. **A size's result.** A size (6×6, 7×7, 8×8) has a total when all three of its boards are
    solved with a time: the three times added up. Otherwise it shows *partial*: the times it
    has, and the state of each other board.
11. **After a result, inside the window: Practice.** The board's first change after its
    result is fixed (an Undo, a Reset, or Play again) starts a Practice run from the board
    that change leaves, with its own clock starting then (codex). So the board never sits
    editable with a stopped clock. Practice is labelled everywhere, is never saved as a
    result, and never changes the attempt's result or its finished mark (D5). The finished
    mark for a challenge date comes from the attempt, not from the board's `completed`,
    which an Undo clears. After the window, the board is an archive board, casual as now.
12. **Streak days.** A date keeps the streak when at least one of its boards is solved
    inside the window: with a time, with a hint, or with a clock error (D9). The streak's
    own rules (freezes, milestones) are D9's, built later against this.
13. **Boards played before the challenge ships** (codex). **Proposed**, and an explicit
    exception to "today and yesterday are always timed": the first time the challenge
    version runs, before any Start is offered, it looks once at the progress records of the
    boards inside the window. Each record that is valid for its board's definition
    (`progressFor`) and holds a board other than the empty one is marked, in its own durable
    record, *played before the challenge*. Such a board isn't covered, is untimed, and has
    no result: it doesn't count towards its size's total or the streak. The marks are
    written once, then a flag records that the check ran; `savedAt` is never used as the
    marker, since it changes with every move. A board with no record is treated as unseen,
    even if it was looked at, because looking leaves nothing to tell (Principle 5). This
    touches only the release's today and yesterday.
14. **What is stored.** Each attempt is saved under its own key, apart from progress and
    outside the 14-day cleanup (D6): the puzzle id, the definition's hash, the date, the
    ruleset version (`1`), the start instant, the assisted flag, and, once it ends, the
    result and the finish instant. A finish that can't be saved still shows its result,
    marked as not saved, and is retried on every later save and every open. A later ruleset
    never reinterprets a result saved under this one.
15. **Two tabs** (codex). Every change to an attempt (Start, the assisted flag, the finish,
    the given-up settlement) is a read-check-write under a per-board lock shared by the
    tabs (`navigator.locks`, the Web Locks API), so two tabs can't both start an attempt or
    both fix a result. The record only moves forward: a saved start is kept, and a second
    Start resumes it; the assisted flag never clears; a fixed result is never overwritten,
    and a tab whose finish arrives second shows the result already fixed. Other tabs pick up
    changes from the `storage` event and on regaining focus. **Where Web Locks are
    unavailable**, the same forward-only merge applies without the lock, and the remaining
    race, two Starts at the same instant, is accepted under the honour system.

**Not in this contract**
- The covered board's look, the clock's display, the result and share cards (D7), stats
  (D6), streak UI (D9), the run receipt (D11), the previous-best split (D12).
- The timer's behaviour on real devices (D13) and the input-fairness study (D14).

### Would need a server (rejected)

**No** by decision: there are no servers. They're recorded so the reason is clear if the
question comes back. Keying every result by puzzle ID and ruleset version (codex), never by the
player's local "today", still keeps local results meaningful.

| # | Idea | Why it needs a server | Decision |
| --- | --- | --- | --- |
| S1 | Secret challenge track | Challenge boards from a new secret seed, served only on their day. The public repo holds every current board through 2036 and the corpus seed (read: `CORPUS_SEED` in `scripts/corpus.ts`), so anyone can know tomorrow's boards. | No |
| S2 | "Faster than X% today" | Needs everyone's anonymous times in one place. | No |
| S3 | Friends and group leaderboards | Needs accounts and invite codes, which stand in for LinkedIn's connections and companies. | No |
| S4 | Progress sync across devices | Needs accounts and merging. Manual export and import (A4) is the no-server route. | No |

Even with all four, a leaderboard would be trusted, not proven: legal moves can be checked, but
not that a human found them in the recorded time (codex).

## Controls

Undoable Reset mattered most: one misclick could wipe a nearly finished board with no way
back. It's built (item 1, PR #6). Item 6 is No. The suggested order is 7, then 4. Item 5 waits for the input study (D14).
Items 2 and 3 are No: there will be no keyboard shortcuts. Item 8, Redo, is No too.

| # | Idea | Why, and the boundary | Helps | Effort | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | Undo reverses Reset | *Before this change,* Reset cleared the board and the undo history, with no confirmation, next to Undo (`reset()` set `moves = []`). *Now* Reset is one entry in the history, holding the squares it changed and what was in them, so Undo takes it back and the moves before it stay undoable; a Reset that changes nothing records nothing (read: `reset()` in `app/stores/PuzzleSession.ts`). Tests cover Undo straight after Reset, and Reset → move → Undo → Undo (codex). Undo history still doesn't survive a reload (saved progress holds only the board, completion and a timestamp), so whether recovery should is a separate decision. | Both | Small to medium | Yes (user): built in PR #6, contract below |
| 2 | Faster keyboard placement | Placing takes three presses: an arrow to reach the cell, Space, then an arrow. My earlier Shift+Arrow idea would reverse a deliberate decision: SPEC row 14 gave Shift back to the browser, with tests (read: commit `0c8fce3`), because Shift+Arrow extends a selection and Shift+Space scrolls. Any new key scheme would be a shortcut. | Challenge, keyboard players | — | No |
| 3 | Shortcuts for Hint and Check, redo, then Reset | The buttons have no keys, and redo doesn't exist. Had they been built, single-letter keys would need board focus or an off switch, per WCAG 2.2's rule on character-key shortcuts (codex). A Redo *button* isn't a shortcut, so it was item 8, since decided No. | Both | — | No |
| 4 | Drag a placed domino to move it | Dragging a placed piece does nothing now (read: `pointerUp` refuses a drag from an occupied cell). Dropping it off the board **cancels** rather than removes, so a missed drag never destroys a move (codex). Tap and Delete stay the ways to remove a piece. Test on touch first. | Casual | Medium, with its own review | |
| 5 | Place during a drag | Placing the moment the pointer enters the neighbouring cell saves time, but it removes release-to-cancel. Scrolling isn't the risk: the board already suppresses one-finger panning (read: `touch-action: pinch-zoom` on `.board-grid` in `app/globals.css`). Treat it as an experiment: measure speed and error rate first (codex). | Challenge | Small to build, study first | |
| 6 | Reset safety, after item 1 *(codex C5)* | Once Undo can reverse Reset, test whether casual players still want a confirmation, hold-to-reset or an "Undo Reset" notice. Never a forced dialog on a challenge board. | Casual | Small | No (user, 2026-10-09): leave Reset as it is. Undo takes it back, and the user tried it. |
| 7 | Controls help on request *(codex C6)* | A short, accessible guide to tap, drag, keyboard and Undo, opened when wanted instead of replaying the tutorial. | Both | Small | |
| 8 | Redo button | Redo doesn't exist. A button beside Undo reapplies the last undone move, and any new move discards the redo history. There's no key for it. | Both | Small | No (user, 2026-10-04): unnecessary. SPEC P1-3's "No redo, deliberately" stands. |

Some controls should stay as they are:
- a tap places the domino at once when only one direction fits;
- tapping a placed piece removes it;
- there is no rotate button, and no piece picker in the default scheme.

### Undoable Reset: implementation contract

**Why.** Reset (item 1) clears the board *and* the undo history, at once and with no
confirmation, beside Undo (read: `reset()` in `PuzzleSession.ts` sets `moves = []`). One
misclick can wipe a nearly finished board for good. Chosen next by the user, 2026-10-03.
Codex reviews this contract before any code. First review, 2026-10-03: approved with four
corrections and two behaviours to pin, all made below. Play again undoable, and a Reset as one
entry towards `MAX_UNDO`, are both agreed.

**How it works today** (read):
- `Move` records exactly two cells and what was in them before, plus the focus's next square.
  `placeToward` and `removePiece` are the only writers, and both record through `record()`,
  which also clears Check's or Hint's answer.
- `undo()` writes `before` back, recomputes `completed` from the rules, moves focus to the
  move's anchor, and clears the refusal, the answer and any gesture.
- Reset is always enabled. The completion card's **Play again** calls the same `reset()`.
- The undo history is bounded at 60 (`MAX_UNDO`) and isn't saved: a reload starts it empty.
- Check's "undo N moves" walks the history backwards (`stepsBackToSolvable`), and already
  takes an entry of any number of cells (`ReplayMove`).

**The contract**
1. **Reset becomes one entry in the undo history**, not the end of it. Undo straight after
   Reset puts back the whole board as it was: every piece, and `completed` recomputed from the
   rules, as any undo does.
2. **The history before Reset survives.** Reset → Undo → Undo undoes the Reset, then the move
   before it. Reset → a move → Undo → Undo undoes the move, then the Reset (codex's two cases).
3. **The entry holds the squares Reset changed**, with what was in them: every square that
   held a piece. Rocks are never touched. So `Move` widens from exactly two cells to a list,
   which `ReplayMove` already is.
4. **A Reset that changes nothing records nothing, and still does the rest.** On a board with
   no pieces, Reset leaves the history as it is, so Undo doesn't spend a press undoing
   nothing. It still clears the gesture, the hover, the refusal and the answer, and the
   cursor, exactly as a Reset that changed something. Not an early return (codex).
5. **The keyboard's square and browser focus are kept apart** (codex). Reset clears the
   keyboard's square (`focusedCell`), as now, and the entry remembers the square it was on.
   - **Undoing a Reset** puts the keyboard's square back on the remembered one. If the Reset
     had none, it leaves the keyboard's square where it is now, never clears it: with browser
     focus on a square and the store on none, the next arrow would be spent setting the
     cursor up instead of moving.
   - **Browser focus follows the existing rule** (`BoardSquare`'s effect): it moves only if it
     is already inside the board. So Undo by the button leaves focus on the button, and
     Ctrl/Cmd+Z on the board moves it to the keyboard's square, so the two stay in step.
6. **Play again is the same Reset, so it's undoable too.** Undo after Play again brings the
   solved board back, and with it the completion card, since `completed` is recomputed.
   *(One rule, rather than a second kind of Reset. If the user wants Play again to be a clean
   start, that's a separate decision.)*
   - **The win isn't celebrated twice.** The win sound and vibration fire from a reaction on a
     board that is solved by the rules but not yet flagged `completed` (`BoardsStore`).
     `undo()` sets `completed` in the same action as the board, so undoing Play again never
     passes through that state, and nothing plays. A test holds it.
7. **Everything else Reset does is unchanged:** it clears the answer, the refusal, the
   gesture and the hover. It counts as one entry towards `MAX_UNDO`, like any move.
8. **Check across a Reset.** Walking backwards, Check reaches the empty board just after the
   Reset before it could step past it. An empty board of a valid puzzle can always be
   finished, so when the walk gets there it stops, and "undo N moves" never counts undoing a
   Reset. **When it gets there** (codex): the walk is bounded by a shared node budget and by
   20 probes (`MAX_PROBES`), and either can run out first. Then it answers as it does today,
   `undoSteps: null` ("a piece is wrong", without a number). Neither limit is bypassed.
9. **Saved progress is unchanged.** What a Reset or an Undo leaves on the board is saved as
   any board is, and survives a reload. The undo history still isn't saved, so after a
   reload there's nothing to undo, a Reset included.

**Not in this change**
- Saving the undo history across a reload (still a separate decision).
- A confirmation, hold-to-reset or an "Undo Reset" notice: item 6, decided after this ships.
- Redo: item 8, since decided No.

**Tests**
- Unit:
  - Undo straight after Reset restores every piece and `completed`;
  - both of codex's sequences;
  - Reset on an empty board records nothing;
  - the entry's cells are exactly the squares that held pieces, never rocks;
  - focus before and after;
  - Play again and Undo bring a solved board and its card back;
  - the 60-entry bound with a Reset in it;
  - Check's walk stopping at the Reset.
  - an empty Reset still clears the gesture, hover, refusal, answer and cursor;
  - undoing a Reset with no remembered square leaves the keyboard's square as it was, and the
    next arrow moves rather than being spent;
  - Check's walk with too small a budget, or more than 20 entries, still answers `null`.
- Browser:
  - Reset, then the Undo button, puts the pieces back on the page, and focus stays on Undo;
  - Ctrl/Cmd+Z does the same from the board, and browser focus lands on the keyboard's square;
  - Play again, then Undo, brings the card back with no second win sound or vibration;
  - after a Reset and a reload the board is empty and Undo is disabled; after a Reset, an Undo
    and a reload the board is back and Undo is disabled.
- Mutations for each rule.
- **Three existing tests change on purpose**, each asserting the old emptied history:
  - `e2e/undo.spec.ts`, "reset clears every move at once" (codex): Undo is enabled after Reset
    now, and pressing it brings the pieces back;
  - `tests/undo.test.ts`, "clears the move stack, so undo cannot write into a cleared board",
    which becomes "is itself undoable";
  - `tests/completion-card.test.tsx`, "Replay resets the board it was given": `canUndo` is true
    after Play again.

  The second and third turned up while building it; the contract named only the first. Every
  other existing Reset test stays as it is.

**As built:**
- `Move.cells` is a list, and `anchor` may be null, meaning "leave the keyboard's square where
  it is". Reset records the squares that differ from the puzzle's start, which covers rocks
  and anything a definition ever places by construction.
- **The win test counts the vibration, and the sound only after the win.** The audio pool
  plays every sound, the win's included, silently on the first press to unlock it on iOS, so
  a raw count of the win sound's plays was 2 before any Undo.
- Mutations, 8 of 8 caught: Reset emptying the history again; an empty Reset recording an
  entry; an empty Reset returning early; no square remembered (by the unit tests, and by
  browser focus); Undo clearing the square when none was remembered; rocks recorded; Undo
  leaving `completed` for the reaction, which then celebrated a second time.
- *Corrected at codex's review:* two of the empty-Reset tests couldn't fail. One ended with an
  empty history (a move and its Undo), and the other's press had cleared the refusal before
  the Reset. Now the history holds a placement and a removal, and a Space on a rock is the
  last thing before the Reset. Against the old version of `tests/undoableReset.test.ts`, an
  empty Reset that emptied the history and a Reset that left the refusal both survived; the
  corrected file catches them, and an empty Reset recording an entry.

## Faster and alternative placement

Today's placement (read: `app/stores/placement.ts`, `PuzzleSession.ts`):
- **Drag** from a cell to its neighbour: one gesture.
- **Tap** a cell. It places at once when only one direction fits. Otherwise it waits for a
  second tap on the neighbour.
- **Keyboard:** arrows to the cell, Space, then an arrow for the direction.
- **Removing:** tap a placed piece, or press Delete.

There are only two pieces: upright (1 over 0) and flat (0 then 2). So "which piece" and "which
way" are the same choice, and a second tap is needed whenever more than one direction fits.

Domino Fit handles this with a selected piece (reported). You click to place the selected
piece, and right-click to switch to the other one. Its pieces don't rotate: upright and flat
are different pieces, as they are here.

**This game had a scheme like that, and SPEC P1-1 removed it.** P1-1 deleted these (read:
`SPEC.md`, P1-1):
- the right-click toggle;
- the toggle button and the `R` key;
- the "selected-piece state to forget you're in";
- the old half-cell rule, which "silently falls through to the opposite direction when the
  preferred neighbour is occupied — violating the rule exactly when the board gets
  interesting".

What made the old rule a defect was overriding a choice. The half of the cell you clicked
*was* your choice of direction, and the fall-through ignored it. A selected piece is different:
the player chooses a piece and a cell, never a direction. Only two positions of that piece cover
the cell, so when one can't fit, the other is the only placement that does what was asked. It's
the same inference today's tap already makes when only one direction fits. So a selected piece
can come back as an opt-in, with one rule carried over from P1-1: **no scheme overrides a
choice the player has expressed.**

The suggestions below cut placements to one click or tap each. They respect two earlier
decisions:
- **No keyboard shortcuts.** Switching the piece is a right-click or an on-screen button,
  never a key.
- **Opt-in.** Anything with a mode lives in a Controls setting, and the default stays as it
  is.

| # | Idea | How it works | Helps | Effort | Decision |
| --- | --- | --- | --- | --- | --- |
| PL1 | Pick a piece (Domino Fit style) | A two-button piece picker beside the board shows the upright and the flat domino, one highlighted. The rules:<br>• **Left click** places the selected piece on the clicked cell; with a mouse, hovering previews the exact two cells first.<br>• **Right-click** switches the piece; the board's context menu is suppressed.<br>• **On touch**, the picker is the switch, and a tap places the piece by PL2's rule.<br>• **Keyboard:** Space places the selected piece at the focused cell, a key the game already uses, so no new shortcut.<br>• **An occupied cell:** clicking it removes the piece, as today. | Mouse players, challenge | Medium: a new mode, with its own contract and tests | Yes |
| PL2 | Which half the clicked cell becomes | Only two positions of the selected piece cover the clicked cell. **When only one fits, it's placed**: that's the only placement that does what was asked, and it matches today's tap, which places at once when only one direction fits. **When both fit, one fixed rule decides:** the clicked cell takes the piece's numbered half, the top (worth 1) of an upright piece or the right (worth 2) of a flat one. To put the blank half there instead, click the cell above, or to the right. *(Changed 2026-10-02: it was the top or left half, a rule about position, which put the blank half of a flat piece under the cursor.)* A mouse hover preview (PL1) shows which it will be. **When neither fits**, the click is refused with the usual shake. This isn't P1-1's old fall-through: that overrode the direction the player had chosen, and here no direction is chosen. | Everyone using PL1 | Small, inside PL1 | Yes |
| PL3 | Two buttons, no mode | Mouse only: **left click places upright, right click places flat**, with the clicked cell taking the numbered half, and hover previews both the upright and flat placements. No selection to remember, one click per piece. It's the fastest mouse scheme, but touch has no right click (long-press is too slow), so touch keeps today's scheme. The PL2 rule applies. | Mouse players | Small to medium | |
| PL4 | Paint with a drag | With PL1, hold the button and sweep across cells: the selected piece is placed wherever it fits along the path. One sweep fills a column of upright dominoes, and Undo removes the whole stroke in one step. The risk is stray placements at the stroke's ends, so it needs play-testing. | Challenge, big boards | Medium to large | |
| PL5 | Place over, by dragging | Dragging a new piece onto cells that already hold pieces replaces them: the overlapped pieces are removed and the new one placed, as one undoable step. **Drag only:** tapping or clicking a placed piece still means *remove*, in every scheme, so place-over can't be a tap (codex). Today a correction is two actions. | Both | Small to medium | |
| PL6 | Right-click removes | Mouse only, in the default scheme: right-click a placed piece to remove it, so a left click never removes by accident. In PL1 and PL3, right-click is already taken. | Mouse players | Small | |

### Pick a piece: implementation contract

Reviewed by codex against the placement code, 2026-09-29. It must hold before any code is
merged.

**Gestures**
- A **press and release on the same cell** uses the held piece and PL2's rule.
- A **drag into an adjacent cell** keeps today's directional placement, even when that makes
  the other piece. Its preview shows the piece the direction makes.
- An **invalid drag** is refused. It never falls back to a held-piece click.
- Everything goes through the existing pointer events, **never a new `onClick`**. Touch sends
  a compatibility click after `pointerup`, which could place a piece and then remove it.
- **Right-click is mouse-only.** A right-button press from a mouse (`pointerType` "mouse",
  button 2) switches the held piece and never reaches the placement or removal handlers. Today
  those handlers don't check the button (read: `onPointerDown` and `onPointerUp` in
  `ClientBoard.tsx`), so the check is new.
- **Only the primary button places or removes** (codex, reviewing the build). Every other
  button, the middle one included, is ignored in Pick a piece mode; a middle click had reached
  the release as a same-cell tap.
- **A touch long-press never switches the piece.** The switch is driven by the mouse button,
  not by the `contextmenu` event, which a long-press also fires. The context menu is suppressed
  on the board only, **and only in Pick a piece mode**, never on the controls around it.
- Today's default mode may treat a right-click like a left click, and also open the browser
  menu (inferred from those handlers, untested). That is a separate investigation. This
  contract doesn't touch the default mode, and no test asserts its right-click behaviour
  either way (codex).

**The held piece**
- **Upright** on first entry to the mode.
- Kept for the rest of the session across puzzle changes and mode switches, so returning to
  the mode returns the same piece.
- Only the control mode is remembered on the device; the held piece is not.

**The rule**
- A pure function returns the **exact two cells, their direction and their pip values**. The
  preview and the commit both use that same result.
- A cell holding either half of a domino, **including a half worth 0**, is occupied. The
  session's existing removal rule handles it first. Rocks refuse.

**Keyboard**
- **Space and Enter** do what a tap on the focused cell does: place the held piece on an empty
  cell, and **remove a placed piece** (user, 2026-09-29, after seeing the refusal's cross drawn
  over their own domino; this replaces "refuse, and never remove"). A rock, or a cell where the
  held piece has no room, refuses. Undo brings a removed piece back.
- **Delete and Backspace** also remove a placed domino.
- Keyboard focus shows the held piece and where it would land, since there's no hover.
- **The input used last decides the preview** (codex, reviewing the build). With the mouse
  resting on one cell and the keyboard moved to another, the preview is the keyboard's, where
  Space and Enter would place; the mouse moving again takes it back. Focus arriving visibly
  counts as the keyboard even when no key reached the board, as when Tab enters it from a
  control outside. A drag in progress keeps its own.
- **A refusal is still handled.** Space or Enter refused on a rock is the board's key, so the
  browser doesn't also act on it: Space doesn't scroll the page.

**Touch**
- Keyboard focus gives no preview on touch. So the picker must show clearly, at all times,
  which piece is held.
- A press-and-hold preview (showing the placement while the finger is down, and placing on
  release) would be a useful addition, not a requirement.

**The mode switch**
- "Controls: Drag / Pick a piece", beside Sound, if it fits the tested phone and desktop
  layouts. The mode is remembered on the device.
- The piece picker appears only in Pick a piece mode.
- Switching modes clears any gesture in progress, without changing the board.
- **Focus**, in two cases:
  - **The focused element survives the switch:** no extra focus move. Activating the switch may
    focus the switch itself, as any button does.
  - **The focused picker is removed:** the mode switch is focused explicitly, so focus is
    never stranded. That fallback is the one programmatic focus move.

**Tests**
- Switching modes mid-gesture, and focus when the picker disappears.
- Right-click switches the piece and never places or removes.
- A touch long-press doesn't switch the piece, and touch's compatibility events don't place
  twice.
- All four board edges and rocks.
- Both positions fitting: the numbered-half tie-break (the top of an upright, the right of a flat; it
  was the top or left until 2026-10-02).
- Only the opposite (bottom or left) position fitting.
- A neighbouring cell occupied by another domino.
- Both halves of an occupied piece, including the half worth 0.
- Space and Enter on either half of a placed piece, the half worth 0 included, remove it, and
  undo restores it. On a rock they refuse without the page scrolling.
- A middle click on an empty or an occupied cell places and removes nothing.
- The mouse resting on one cell and the keyboard on another: the preview is at the keyboard's
  cell, and Enter places there. Also with focus entering by Tab from outside the board,
  checked before Space.
- The held piece: upright on first entry, kept across puzzle and mode switches, not
  remembered on the device.
- The context menu stays available on the board in the default mode.
- The default mode's existing placement tests pass unedited.

**As built** (`feature/pick-a-piece`), four choices the contract left open:
- **The picker is two chips, in the legend's place** (redesigned 2026-09-29). First built as the
  scoring legend's two pieces turned into toggle buttons, in the legend's capsule: boxes of two
  sizes, the held one filled solid blue, and no names. The user called it "horrendous". Now
  it's one row of two equal chips, each the piece drawn beside its name, "Upright"
  or "Flat". They sit centred under the board's frame, with no capsule, and nothing touches a
  border. It's a radio group, since exactly one piece is always held: one tab stop, on the piece
  held, and arrow keys choose the other. Chosen is a ring and a check mark inside the chip (the
  new `choice` control variant, GRAPHICS-SPEC P2-2), never a fill. The row is shorter than the
  legend, so the board is larger in this mode. In the default mode the legend is exactly as it
  was, `role="img"` and not a button.
- **The switch reads "Pick a piece"**, pressed when the mode is on, built like Sound
  ("Sound", pressed when on). The contract's "Controls: Drag / Pick a piece" was one label for
  both states; one name that is pressed or not is shorter in the row it shares with Archive and
  Sound at 360px, and says the same thing to a screen reader.
- **The tutorial keeps the default controls.** Its text teaches the drag and the tap, and it
  shows before a player could choose, so its 2x2 board is fixed to the default mode.
- **The switch and Sound wrap together.** At 360px the navigation row had no room for another
  button, and adding one left Sound alone on a second line. The two are grouped, so they wrap
  as one row of settings; the phone page is 48px taller (652 to 700px in the baseline).

The default mode's refused Space and Enter are handled too, in a separate commit (codex): on a
rock, an occupied cell or a cell with no legal direction the refusal is shown, and Space no
longer scrolls an overflowing page. Shift+Space and other chords stay the browser's.

### Keyboard polish: implementation contract

**Why.** The user found keyboard play unpolished in three ways: switching pieces, knowing what a
key does, and the focus marker's look. Codex added a fourth: a refusal says nothing to a screen
reader (U6). The underlying problem is a rule that changes between modes without saying so. In
the default mode Space selects and an arrow places; in Pick a piece mode Space places or removes
at once. The tutorial explains only the first.

**Decided (user, 2026-09-30, from prototype screenshots):**
- The focus marker becomes **soft corners**.
- A **one-line key guide** per mode.
- A refusal's reason is **shown and spoken**.
- **Switching pieces stays Tab, arrow, Shift+Tab**, explained by the guide. A single key on the
  board is reconsidered only if that still feels slow after play.

Codex reviews this contract before any code. First review, 2026-09-30: codex would approve it
with three corrections, now made below (the guide's wording and description, and the refusal
paths). Second review, the same day: **approved for implementation**, with three details carried
in below: "Ctrl/Cmd+Z" in the full instructions, the announcer's refusal cleared with the cross,
and a reason precedence for drags. Codex also moved the real screen-reader check from U1 into
this feature's acceptance (see "Acceptance").

**1. The focus marker: soft corners**
- Four rounded corner brackets, thinner than today's, in the accent's edge on a white halo. The
  prototype drew them 5 units wide on a 9-unit halo, 8 in from the edge, each arm 24 long, with
  a radius-6 bend. They mean the same thing and follow the same rules as now: drawn while
  `focusVisible`, above the pieces.
- **Held to the existing bars, not new ones:**
  - P1-5's greyscale test: at least 15% from the anchor, candidate, hint and refused marks, and
    at least 5% of the square, at 38px and 53px.
  - The same test over a rock and over both dominoes.
  - The cross's ends still stop short of the brackets.
  - Contrast: the focus colour on both checker tones at 3:1 or better. As with the cross, the
    halo can carry it where the colour alone doesn't. `tests/contrast.test.ts` records which does.
- If the soft corners fail a bar, the drawing changes, not the bar, as with the cross in row 12.
- The colours become tokens: `cellFocus` changes value, and a halo token is added. They aren't
  literals.

**As built, section 1:** as prototyped, with one change the bars forced. The accent's edge
itself is 2.93:1 on the dark checker tone, so `cellFocus` is that hue at 85%, `#093346`,
which holds 3:1 on both tones alone rather than leaning on the halo. The halo is held as the
cross's is. Measurements and mutations: GRAPHICS-SPEC, the amendment after row 11.

**2. The key guide** *(corrected at codex's review: the wording, and what the description promises)*
- **Visible:** one line, in the row under the picker that the Check and Hint messages use.
  It's accurate even when short:
  - **Default mode:** "**Space**, then an **arrow**: place · **Delete**: remove". It's two keys
    in turn, not a chord, so not "Space + arrow".
  - **Pick a piece:** "**Space**: place or remove · **Tab**: piece picker". Tab reaches the
    picker, and the picker says the rest: it's a radio group whose arrows switch the piece.
- **When the visible line shows:** while the board shows keyboard focus (`focusVisible`) and
  there's no Check or Hint message and no refusal reason. A press or tap hides it, as it hides
  the focus marker. It also hides when focus leaves the board.
- **Nothing moves:** one line at 360px in both modes, and the board's size is unchanged when the
  line appears. Both are tested.
- **For assistive technology, the full instructions**, mode-specific and never live:
  - Default: "Arrow keys move. Space or Enter selects a square, then an arrow key places a piece
    that way. Escape cancels. Delete removes a piece. Ctrl/Cmd+Z undoes."
  - Pick a piece: "Arrow keys move. Space or Enter places the held piece, or removes a placed
    one. Delete removes a piece. Ctrl/Cmd+Z undoes. Tab goes to the piece picker, where an arrow
    key switches the piece; Shift+Tab comes back to the same square."
  - "Ctrl/Cmd+Z", not "Control+Z", because the board takes either (codex).
- **Where the full instructions live:** a visually hidden element, **always mounted**, before
  focus arrives, and referenced by the grid's `aria-describedby`. The visible line is
  `aria-hidden`, so browse mode doesn't read the same thing twice; its equivalent is the
  description.
- **No promise about when it's read.** The game focuses a *cell*, not the grid, and whether a
  screen reader reads the grid's description as focus lands on a cell varies by reader. The
  tests can prove the markup, not the speech. A manual check with a real screen reader is part
  of this feature's acceptance (see "Acceptance").
- **The tutorial:** one sentence for keyboard players, matching the default mode, since the
  tutorial is fixed to the default controls.

**As built, section 2:**
- **The guide** is the row's last choice, after a refusal's reason and a Check or Hint answer,
  with its keys in bold (`keyGuide.ts`). Measured at 360px on this PC: 290px wide in the
  default mode and 271px in Pick a piece mode, and the row stays at its 24px minimum. CI's
  text is wider, and the one-line test runs there too.
- **The size test runs at two sizes.** At 360x640 the board is limited by the width, so a guide
  that grew the row only lengthened the page, and passed (mutation-tested). At 1280x800 it's
  limited by the height, where a taller row would take from the board. Both also hold the row's
  height.
- **The description** is a visually hidden paragraph just before the board, named by the
  grid's `aria-describedby` through `useId`, so the tutorial's board and the page's each have
  their own. The tutorial's board describes the default mode, which it's fixed to.
- **The tutorial already had a keyboard sentence**, so it was reworded rather than added: "By
  keyboard: arrow keys move, Space selects a square, then an arrow key places a piece that way.
  Delete removes one, and Esc cancels." It rendered as "places.Esc cancels.", a space lost to a
  line break before a tag in JSX, now held by a test.

**3. A refusal, said in words** *(corrected at codex's review: reasons come from the actual
paths, and the reason is stored with the refusal)*
- **The reason is stored when the refusal happens**, alongside `refusedAt` and with the same
  lifetime. It isn't inferred later from the board.
- **Every refusal path, and its reason** (read: every `signal('none', …)` in `PuzzleSession`):

  | Path | Reason shown and spoken |
  | --- | --- |
  | A tap, Space or Enter on a rock; a drag starting on a rock; Delete on a rock | "That square is a rock." |
  | Space or Enter on a placed piece, default mode | "Delete removes a piece; Space selects an empty square." |
  | A tap, Space or Enter on an empty square where no piece fits (default); where the held piece fits neither way (Pick a piece) | "No room for a piece there." / "No room for the upright piece there." (or "flat") |
  | A drag starting on a placed piece | "Placed pieces can't be dragged; tap one to remove it." |
  | A drag released on a square that isn't next to its start (diagonal or further) | "Drag to a square next to it." |
  | A drag, or an arrow after a selection, pointing into a rock or a placed piece | "That way is blocked." |
  | An arrow after a selection pointing off the board | "That's the edge of the board." |
  | Anything else that refuses (a malformed piece's removal, which the rules prevent) | "That can't be done there." |

- **Precedence, where a refusal fits more than one row** (codex): the square the move started
  from is judged before where it was aimed. A drag from a rock says "That square is a rock.",
  and a drag from a placed piece says it can't be dragged, whether it was released diagonally,
  on a blocked square or on a legal one.
- **Not refusals, and they stay silent:**
  - a pointer released outside the board (deliberately a silent cancellation);
  - an arrow that simply stops at the edge while moving focus, with nothing selected.
- **In the row, red,** as Check's problems are, for every refusal, by pointer or key, in both
  modes, because every refusal draws the cross.
- **Visible and spoken are separated**, so restoring text never announces it again:
  - The visible row stops being the live region.
  - One visually hidden polite status region is the announcer. It receives each new Check or
    Hint answer (keyed on `adviceTick`, as now) and each new refusal reason (keyed on
    `rejectionTick`), so a repeat is a new announcement.
  - While a reason shows, it takes the visible row. When it clears (with the cross), the
    announcer's copy of it is cleared too (codex), and an earlier Check or Hint message, which
    survives a refused move, **reappears visually and is not announced again**.
  - `role="status"` is polite. It doesn't guarantee every rapid message is spoken, so the tests
    prove the announcer's content, and the manual screen-reader check covers speech.
- Refusals are unchanged in all other ways: the shake, the cross and the vibration.

**As built, section 3** (three choices the contract left open):
- **One field for the cross and its reason.** `PuzzleSession.refusal` holds the square and
  why; `refusedAt` is read from it, so the two can't outlive each other. Each path returns its
  reason where it refuses (`Refusal` in `PuzzleSession.ts`, worded in `refusalText.ts`).
- **Each message is in the accessibility tree once.** The contract made only the guide
  `aria-hidden`. The row's copy of a reason, or of a fresh Check or Hint answer, is hidden too,
  while the announcer holds it, so reading the page doesn't meet it twice. An answer back in
  view after a refusal is the row's alone, and readable there.
- **The announcer has the body type role**, like the row, since the typography audit holds all
  text, hidden or not, to a role.
- *Correction at codex's implementation review:* `7dcc1aa` said every path to `signal` had
  already cleared the refusal, so clearing it there again was an equivalent mutation. That
  holds on the ordinary paths only. With an anchor pending and an arrow refused, a release
  that arrives with no press on the board dismisses the anchor, and nothing clears the cross.
  It used to clear there, and now it stays. Codex judged that right, since nothing was pressed
  on the board, and a test now holds it: clearing it in `signal` again fails.

**Tests (sections 2 and 3)**
- The guide:
  - the visible wording per mode;
  - shown only with keyboard focus on the board, and hidden by a press, a blur, advice or a refusal;
  - one line at 360px;
  - no change to the board's size;
  - `aria-hidden`;
  - the description always in the DOM, mode-specific, and referenced by the grid.
- Refusals:
  - each path in the table produces its reason, by key and by pointer, in both modes, and the
    silent cases produce none;
  - the reason is stored with `refusedAt` and cleared with it;
  - the announcer's content per refusal, including a repeat;
  - advice reappearing in the visible row without a change to the announcer.

**4. Switching pieces**
- No new key. The guide names Tab. The route is unchanged, and was measured: Tab from a square
  lands on the held chip, an arrow switches, and Shift+Tab returns to the same square.
- **Revisit after play.** If it's still slow, a key that works only while focus is on the board
  and is listed in the guide. That would reverse the "no keyboard shortcuts" decision, so it's
  the user's call.

**Tests (section 1)**
- The marker: the greyscale and footprint tests at both sizes, over each occupant, and with the
  cross; contrast; the sheet's `focus` specimen, so this is a visual update.
- Mutations for each rule, in every section.

**Acceptance: a real screen reader** (codex, second review). The tests prove markup and the
announcer's content, not speech, so the feature isn't accepted until someone has listened.
This is a real gate: focus lands on a cell while the full instructions are the description of
its parent grid, and whether a reader reads a parent's description is exactly what varies.
Codex reviewed the implementation at `38512ed` (2026-10-01) and found no code blocker, and
holds final acceptance on these four checks.

**Accepted by the user, 2026-10-03, without the listening check** ("is good enough, lets
continue"). So the speech is **unverified**: no one has heard what a screen reader says on
the board. The four checks below move back to U1's play-test, unrun, and stay open there. Only
Narrator is installed on the development PC, and Claude can't hear it, so this is a person's
check, recorded here with the reader and browser used:
1. With Narrator (Win+Ctrl+Enter) or NVDA, Tab onto the board in each mode. Is the full
   instruction read, at once or with the reader's command for more about an item?
2. Space on a rock, then on a placed piece in the default mode. Is each reason spoken, and is a
   second Space on the same rock spoken again?
3. Check, then a refused Space, then an arrow. Is the Check answer spoken once, and not again
   when it reappears after the refusal clears?
4. The picker: Tab from a square, an arrow, Shift+Tab. Is the held piece's name and state read,
   and does Shift+Tab land on the same square?

**Not in this change:**
- Full-page Pick a piece baselines (codex, on the chips): U7.
- The single switch key.

Notes for all of these:
- **Challenge fairness.** A scheme can change a time a lot. The input study (D14) should compare
  the default, PL1 and PL3 before challenge times are shared as comparable. The share card
  could name the scheme used.
- **Tests.** The placement contract (SPEC row P1-1, one verb for drag, tap and keyboard) is held
  by unit and browser tests. Each new scheme needs its own written placement rule and tests
  beside those, not an edit to them.
- **Placing during a drag**, rather than on release, is also a speed idea: see Controls 5.
- **Order.** PL1 with PL2 now, as one opt-in mode, against the contract above. PL5 later,
  as its own change. Try PL3 and PL4 only after play-testing PL1.

### Making today's drag feel better

These improve the default drag without adding a mode. How it works today (read):
- **The direction comes from the cell under the pointer.** `ClientBoard.tsx` asks the browser
  which cell the pointer is over, and a drag counts only once it's over the neighbour. The
  distance that takes depends on where in the cell you pressed: almost nothing from near the
  edge, nearly a whole cell from the far side (codex corrected my "at least half a cell"). The
  same flick sometimes places and sometimes doesn't.
- **Anything but a neighbour does nothing.** A drag that wanders onto a diagonal cell, or
  overshoots two cells, shows no preview and does nothing on release (`directionBetween`
  returns null).
- **Leaving the board ends the drag.**
  - A mouse has no pointer capture on the board, so leaving it fires `onPointerLeave` →
    `cancelDrag`, and a release outside never reaches the board at all.
  - Touch pointers are captured implicitly, so the release does arrive, but off the board it
    resolves to no cell and the drag is dropped.

  Either way, overshooting when placing on an edge row loses the move.
- **The preview is a shaded box over the two cells** (`Hover.tsx`), without the piece's pips
  and without its effect on the line sums.
- **Placing vibrates** on phones that support it (`vibrate` in `app/dominoFill/feedback.ts`).

| # | Idea | How it works | Effort | Decision |
| --- | --- | --- | --- | --- |
| DG1 | Direction from the movement, not the cell | Once the pointer has moved a fixed distance from where it was pressed, about a third of a cell, the larger of the horizontal and vertical movement picks the direction. The same flick then always does the same thing, wherever in the cell it starts. A wobble onto a diagonal or an overshoot of two cells still places the intended domino. **Unlocking:** while the pointer is back within that distance of the press point, no direction is chosen, and releasing there is a tap. This changes the P1-1 drag contract, which today refuses a release on a diagonal cell, so it needs its own tests on mouse and touch. | Medium | |
| DG2 | Keep an edge drag alive off the board | Leaving the board mid-drag no longer cancels, and the release resolves by DG1. **For mouse** that needs the board to capture the pointer on press (`setPointerCapture`), so the release outside still arrives (codex). **For touch**, the release already arrives, but it must resolve by DG1 instead of by the cell under the finger. **To cancel**, bring the pointer back within DG1's distance of the press point: the direction unlocks, and the release is a tap on the start cell. Pressing Escape, or a `pointercancel`, also cancels, as today. Test both paths on mouse and on touch. | Small to medium, with DG1 | |
| DG3 | Preview the real piece | Show the domino that would be placed, drawn with its pips, semi-transparent, instead of a shaded box. You see at once whether it's the upright 1-over-0 or the flat 0-then-2. | Small to medium | |
| DG4 | Show a blocked move | When the direction you're pulling in can't fit, show the piece outlined as blocked, instead of no preview at all. The player learns why the release will do nothing, before letting go. | Small | |
| DG5 | Preview the line sums | While a preview is showing, the affected row and column targets show what they would become, for example "4 → 5 of 6". This helps the actual deduction, and it's visible even where a finger hides the cells. | Medium | |
| DG6 | A tick when the direction locks | A very short vibration and a soft sound the moment DG1 picks a direction, separate from the existing placement vibration. It confirms the drag has been understood. Only on devices that support vibration, and silent when sound is off. | Small | |
| DG7 | Settle animation on placing | The placed piece drops in over about 0.1 s. The motion rules already cap durations at 0.2 s (read: `LIMITS` in `app/dominoFill/motion.ts`), and it must never block the next move (D10). | Small | |

Suggested order: DG1 with DG2 as one change, then DG3 with DG4, then DG5. DG6 and DG7 are
polish. Controls 4 (drag a placed piece to move it), PL4 (paint with a drag) and PL5 (place
over) extend the drag further, and are better built after DG1.

## Archive and progress

Today the archive forgets: progress untouched for 14 days is deleted, finished or not.

| # | Idea | Why, and the boundary | Effort | Decision |
| --- | --- | --- | --- | --- |
| A1 | Keep finished days marked | A day finished last month shows as "not played" (read: `isExpired`, `markForDay`). Keep a compact completion record per puzzle, with its definition hash, and tell "completed" apart from "played". Test storage growth and migration (codex). | Small | |
| A2 | Keep unfinished boards longer *(codex C1)* | The same cleanup erases an unfinished board while its day stays in the archive. Keep unfinished boards until they're completed, or cap by count or size instead of age. | Small to medium | |
| A3 | Month names | The heading reads "2026-09" (read: `app/dominoFill/Archive.tsx`). Use a fixed locale policy, and keep the full date in screen-reader labels (codex). | Small | |
| A4 | Export and import progress *(codex C3)* | A file for backup and for moving to another device without a server. Validate the schema, definition hashes and board rules on import, and show what will be merged or replaced. | Medium | |

## Puzzle quality

On 225 sampled rock layouts (measured, 25 per slot):
- the current generator made the same puzzle as the original in all 69 cases where either
  found one;
- on 8×8 boards with 6 rocks it averaged 9 ms (worst 49 ms), against the original's 4.4 s
  (worst 26.5 s).

A sample isn't proof (codex). The code suggests the same, though that is inferred and
untested:
- both versions walk tilings in the same order and keep the first set of line sums that only
  one tiling produces;
- the current one can differ only where a search budget runs out;
- its early rock check rejects only layouts that can't be tiled at all.

Neither version has been shown to make good puzzles for people.

| # | Idea | Why, and the boundary | Effort | Decision |
| --- | --- | --- | --- | --- |
| P1 | Blind human difficulty study *(codex Q1)* | People solve an unseen, sampled set; record time, errors, hints and how hard it felt. **Not from challenge times** (codex): the puzzles are public, players may have practised, and the players who choose the challenge aren't a fair sample. | Study first | |
| P2 | Rate difficulty | Difficulty is only board size and rock count (read: `SLOTS` in `scripts/corpus.ts`). The solver's node count measures its own search order, not necessarily human difficulty (codex), so check it against P1 first. | Medium to large | |
| P3 | Puzzle metadata *(codex Q2)* | Tag published puzzles by measured difficulty and orientation balance without changing them, so the archive can filter or suggest practice. | Medium | |
| P4 | The lean towards vertical pieces | 58 to 78% of pieces were vertical, depending on the slot (measured). The cause is probably that the search tries vertical first (inferred). Measure that before changing it. | Small to experiment | |
| P5 | A wider difficulty ramp | The three levels differ by 2 rocks each (read: `SLOTS`). Needs play-test evidence. | Medium | |
| P6 | A new track or season *(codex Q3)* | Better puzzles arrive under new IDs, while the original archive and saved boards stay intact. Every date through 2036-08-31 is published and the build refuses to change one (read: the append-only rule in `scripts/corpus.ts`). | Large | |

## Mobile app

No server is needed for any of this. The game has no server actions or route handlers, and
the only production page renders one client component (read), so a static export looks
possible, and Capacitor can wrap one for both stores. The website keeps working unchanged.

**It looks possible, but hasn't been shown to work** (codex). There are three known obstacles:
- **Cache headers.** Next's static-export guide lists `headers()` as unsupported, and
  `next.config.ts` uses it today for the puzzle files' cache headers.
- **Storage isn't in one place.** Three modules use local storage directly: `progressStorage.ts`,
  `SoundStore.ts` and `app/hooks/useLocalStorage.ts` (read). An earlier draft of this doc
  wrongly said there was one.
- **Native storage is asynchronous.** Capacitor Preferences returns promises, while progress is
  loaded synchronously at startup (read: `progressStorage.ts` has no async code).

So the estimates below wait on M0.

| # | Idea | Why, and the boundary | Effort | Decision |
| --- | --- | --- | --- | --- |
| M0 | Feasibility spike | Build a static export with `headers()` left out of that mode, wrap it in a Capacitor Android shell, then play, kill the app, reopen and confirm progress, sound setting and archive marks all come back. It settles M2 to M4's real size. | 1–3 days | |
| M1 | Offline web app | A service worker caches the app and puzzles so it plays offline once installed. Useful on its own. | 1–2 days | |
| M2 | Static export build | An export mode in `next.config.ts` that leaves out `headers()`. The cache policy it sets doesn't matter inside an app, but the website build keeps it. | After M0 | |
| M3 | Android app with Capacitor | Buildable on Windows with Android Studio. Puzzles ship inside the app (`public/puzzles` is 13 MB uncompressed, measured), either all of them or a year or two. | After M0 | |
| M4 | Progress in native storage | iOS can clear a web view's local storage when space runs low. All three storage users must move, and the synchronous startup load must either become asynchronous or read from a copy restored before the game starts. M0 decides which. | After M0; not small | |
| M5 | App feel | Haptics on placing and refusing, an optional daily notification, splash screen and status bar colours, no rubber-band scrolling, re-checking the date on resume. These make the app better, but **Apple's guideline 4.2 promises nothing** about what makes a wrapped web app acceptable (codex). Review is a risk until it's passed. | Medium | |
| M6 | iOS app | Needs a Mac, or GitHub Actions' macOS runners, which are virtual machines, not Docker. The Apple developer account is $99 a year; Google Play's is $25 once. | Medium | |

## Campaign (future, for the mobile release)

A campaign is a long numbered path of levels, like the mobile puzzle games with thousands of
them. It's played at your own pace, alongside the daily puzzles. It's a future feature for the
app (M3–M6), and it needs no server. It's also a new track in P6's sense: campaign levels
have their own IDs, and the published daily archive is never touched.

What the codebase already gives it:
- **A fast generator.** An 8×8 board with 6 rocks took 9 ms on average on the development
  PC (measured). It hasn't been timed on a phone.
- **A solver that proves each puzzle has exactly one solution.**
- **Cheap storage.** A puzzle costs about 384 bytes: 12,616,315 bytes for 32,877 puzzles
  (measured). So 5,000 levels would be about 1.9 MB before compression.

Two limits:
- **Board size.** 8×8 is the largest board that fits a 360px-wide phone at the 38px minimum
  cell (read: `MIN_CELL_PX` in `app/stores/cellFloor.ts`). A 9×9 board's cells alone are 342px,
  against the 328px left after 16px margins (inferred from that arithmetic). So growth has to
  come from more than board size.
- **Difficulty is only size and rock count today.** A long campaign lives or dies on its
  difficulty curve, so it depends on P1 and P2.

| # | Idea | How it works | Effort | Decision |
| --- | --- | --- | --- | --- |
| CP1 | Where levels come from | Recommended, a hybrid. The first levels, say 1,000 to 2,000, are pre-generated, checked in CI like the daily corpus, and shipped in the app, where they can be hand-ordered and checked. Beyond them, "endless" levels are generated on the device from the level number, by a frozen, versioned copy of the generator, so level 2,345 is the same for everyone and never changes. | Large | |
| CP2 | A difficulty curve | Start with 4×4 boards and few choices, and grow through 5×5, 6×6 and 7×7 to 8×8. Within a size, order levels by the measured difficulty from P1 and P2, not by rock count alone. Easy "breather" levels come after hard ones. | Medium, after P1 and P2 | |
| CP3 | Chapters and a level map | Chapters of about 50 levels on a scrolling map, each with its own colour theme drawn from the palette tokens. Finishing a chapter is a milestone. | Medium | |
| CP4 | Stars without a clock | Up to three stars a level: solved; solved without a hint; solved without Check or Undo. No time pressure, which keeps the campaign calm. The Daily Challenge is where speed counts. | Small | |
| CP5 | The tutorial becomes the first levels | Today's tutorial turns into levels 1 to 5, each teaching one idea: placing, removing, line sums, rocks, then a full board. | Medium | |
| CP6 | New ideas over time | A long campaign needs variety beyond bigger boards. Candidates, each a rule change the solver must support and prove unique: dominoes already placed as givens; some line targets hidden; boards shaped by rocks, such as a ring or an L. Each needs its own spec row and tests. | Large, one per idea | |
| CP7 | Progress on the device | Campaign progress lives in native storage (M4), is included in export and import (A4), and is never touched by the 14-day cleanup. | Small, with M4 | |
| CP8 | On-device generation budget | Measure the generator on a low-end phone before promising endless levels. If a level can take too long, generate the next few ahead of time in the background. | Study first | |

## Upkeep

| # | Idea | Why, and the boundary | Effort | Decision |
| --- | --- | --- | --- | --- |
| U1 | Play-test on a phone | Every visual change was checked against the spec and pixel baselines, not against people. Include a first-time player, an experienced one, touch, keyboard and a screen reader, and record what happens, not only opinions (codex). The screen-reader part includes the keyboard polish's four listening checks, accepted without them on 2026-10-03 (see its contract's "Acceptance"). Do this before deciding between design ideas. | A few days | |
| U2 | Trim the longest comments | About 3,500 of the app's 8,148 lines are comments (measured). Keep the history in git; start from a short current design note (codex). | Medium | |
| U3 | A short design note | `GRAPHICS-SPEC.md` and `SPEC.md` total about 4,300 lines (measured), much of it correction records. A short note becomes the entry point; the specs stay as history. | Medium | |
| U4 | Gate by risk | The full gate and review round suited a careful rebuild. A text change needs less than a change to timing, storage, input or content. Never drop the tests that protect a rule (codex). Tests run to about 22,700 lines (measured). | A decision | |
| U5 | Tighten the archive's viewed-day ring | Codex's optional note from row 14: the ring is styled for any `aria-current` value, not only `"date"`. It isn't a live bug. | Small | |
| U6 | Say a refusal out loud | A refused move is a shake, a cross and a vibration. The cross is `aria-hidden`, the vibration is phone-only, there's no sound, and no live region announces it (read: `feedback.ts`, `Selection.tsx`, `cellLabel.ts`). So a screen-reader user on a computer gets no sign a move was refused (codex). A polite live region, such as "Can't place there", would fix it. Check this before changing how long the cross stays. | Small | Yes: moved up into the keyboard polish (user, 2026-09-30) |
| U7 | Full-page Pick a piece baselines | The two full-page baselines show the default controls, so no baseline shows the chips on a whole game page. The sheet does, and browser tests hold their layout (codex, reviewing the chips). Add phone and desktop pages in Pick a piece mode. | Small | |

## Open questions

Answered:
- [x] **Which boards form the challenge?** All nine of the day's boards (2026-10-09; it was
  the three 8×8 boards).
- [x] **When does the clock start?** When a board is revealed.
- [x] **One total or separate times?** A time per board, and a total per size (2026-10-09; it
  was one total).
- [x] **In order?** No, any order (2026-10-09; it was Hard 1, then 2, then 3).
- [x] **Can today's boards be played untimed?** No. Every one is covered until Start, and
  clock-free play is the archive (2026-10-09).
- [x] **What does a hint do?** It costs that board's time only (2026-10-09; it was the day's
  result).
- [x] **Undo and Reset?** Allowed.
- [x] **Streaks?** Yes; one challenge board solved keeps one alive.
- [x] **Streak freeze?** One earned for every 3 days played, at most 3 saved.
- [x] **Servers?** None.
- [x] **Keyboard shortcuts?** None.
- [x] **The name?** Daily Challenge.

Before any challenge work:
- [x] **May a board be opened casually, and the challenge still attempted later?** (codex's
  first question.) Answered by the user's 2026-10-09 decision: today's boards have no casual
  way in, so a board's first look is always its timed attempt (D1).
- [x] **A hint, now that results are per board.** That board's time only; the board finishes
  marked as hinted, and its size has no total that day (user, 2026-10-09).
- [x] **Which dates can a first attempt start on?** Today or yesterday on the player's device
  (D8), and yesterday's boards are covered and timed like today's (user, 2026-10-09). Streaks
  follow the same window (D9).
- [x] **Partial totals.** A size's total needs all three of its boards; anything less shows a
  partial result, and any solved board keeps the streak, hinted or checked ones included
  (user, 2026-10-09).
- [x] **Abandoning.** No give-up button. A started board left unfinished counts as given up
  when its date leaves the today-or-yesterday window, and its clock runs until then (user,
  2026-10-09).
- [x] **Replays inside the window?** Yes, as timed Practice, labelled everywhere, never
  changing the first attempt's result (user, 2026-10-09).
- [x] **Check on a challenge board?** It counts like a hint, because it tells you something
  about the solution (user, 2026-10-09).
- [x] **Does a hinted solve keep the streak?** Yes, and so does a checked one. The streak
  rewards playing; the hint has already cost the time (user, 2026-10-09).
- [x] **Does a "day played" for earning a freeze need a challenge board solved?** Yes, the same
  rule that keeps the streak (user, 2026-10-09).

Before any placement or drag work:
- [x] **Which placement scheme beyond today's?** Pick a piece (PL1 with PL2), as an opt-in
  control mode.
- [x] **In Pick a piece mode, what does the held piece govern?** Taps and clicks only. A drag
  keeps today's directional placement, so it can place the other piece, and its preview shows
  which.
- [x] **Where is the mode switched?** Beside Sound, if it fits the tested layouts, and
  remembered on the device.
- [ ] **PL5 (place over, by dragging) for everyone?** Still recommended, independent of the
  mode.
- [ ] **Which drag improvements?** Recommended: DG1 and DG2 together, with the unlock and
  cancel rules above; then DG3 and DG4.

Later:
- [ ] **Campaign: do its levels count towards the daily streak, and is the app ever
  monetised?** Store purchases need no server of our own, but they would change the design of
  hints and stars.
- [ ] **Which slice first?** Suggested:
  1. casual safety (A1, A2; Controls 1 is built and 8 is No), which doesn't wait on any
     question here;
  2. the mobile spike (M0);
  3. the Daily Challenge core (D1–D9), once its questions are answered.

  Play-testing (U1) runs alongside.

## Sources

- LinkedIn Help, [Games on LinkedIn](https://www.linkedin.com/help/linkedin/answer/a6863543):
  connections leaderboard, top 50 companies and schools by average score (500-employee
  minimum), streaks, sharing.
- LinkedIn Help, [game scoring](https://www.linkedin.com/help/linkedin/answer/a6889085): Pinpoint
  is scored by clue reveals, while Queens is scored by time (cited by codex).
- Towards Data Science, [A Product Data Scientist's Take on LinkedIn Games After 500 Days of Play](https://towardsdatascience.com/a-product-data-scientists-take-on-linkedin-games-after-500-days-of-play/):
  percentile cards ("Smarter than 90% of CEOs"), streak cards and notifications, share
  prompts, nudges.
- Social Media Today, [LinkedIn's Gaming Leaderboards for Connections Are Now Live](https://www.socialmediatoday.com/news/linkedin-launches-connection-leaderboards-linkedin-games/802785/):
  connection leaderboards are opt-in and shown above a threshold of playing connections.
- Pinpoint Daily, [Complete Guide to All LinkedIn Games](https://pinpointdaily.org/linkedin-games/):
  one attempt per game per day; the logic games' result is the time at completion
  (third-party).
- Playlin, [Domino Fit](https://playlin.io/game/domino-fit/): click to place, right-click to
  switch between the domino options (third-party guide).
- Domino Fit, [FAQ](https://dominofit.isotropic.us/faq.html): "You can't rotate the dominos."
- Next.js, [Static exports](https://nextjs.org/docs/app/guides/static-exports): `headers()` is
  listed as unsupported (cited by codex).
- Capacitor, [Preferences API](https://capacitorjs.com/docs/apis/preferences): an asynchronous
  API (cited by codex).
- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
  4.2 minimum functionality (cited by codex).
- W3C, [High Resolution Time](https://www.w3.org/TR/hr-time-3/): the monotonic clock and its
  limits across page loads (cited by codex).
- W3C, [WCAG 2.2, character key shortcuts](https://www.w3.org/TR/WCAG22/#character-key-shortcuts):
  single-letter shortcuts need focus scoping or a way to turn them off (cited by codex).
- Speedrun.com, [editing a leaderboard](https://www.speedrun.com/support/learn/editing-a-leaderboard):
  timing and verification are rules each game sets (cited by codex).
