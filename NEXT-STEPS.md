# Domino Fill: what's next

2026-09-28, updated 2026-10-10 · proposals after the graphics spec (rows 1–16) closed at
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
depend on them. *Amended 2026-10-10: that was the pre-decision hold. Ruleset v1 is now
accepted, challenge slice 1 is merged, and Claude accepted slice 2's contract at `4376e7d`
(2026-10-10). Slice 2 is being built in the five reviewed commits below.
Each later slice still needs its own accepted contract before implementation.*

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
| 2026-10-09 | Ruleset v1 (D2) is accepted. | Codex called it ready after five reviews. The fallback where IndexedDB doesn't open saves to `localStorage`, still timed, and may lose data: "we just save and the user will lose it, no big deal" (user). |
| 2026-10-09 | A detected clock error gives a solve with no time. | It keeps the streak, with no time and no size total (rule 5). |
| 2026-10-09 | Boards played before the challenge ships stay untimed. | Marked "played before the challenge": no result, outside totals and the streak (rule 13). |
| 2026-10-10 | Codex builds Daily Challenge slice 2, the wiring; Claude reviews its plan and code (user, 2026-10-10). | Contract first, from merged `master` at `11b87a1`. Public activation waits for slice 3's covered boards and Start controls. |
| 2026-10-10 | Start clears existing progress when creating an attempt on a board with no legacy mark (user, 2026-10-10). | The first timed attempt begins empty, including after writes by an old-version tab. A failed Start preserves that progress; marked legacy boards remain untouched and existing attempts resume their own progress. See slice 2, item 5. |
| 2026-10-10 | Where neither storage backend is usable when the tab opens, play timed but unsaved (user, 2026-10-10). | Today's and yesterday's boards remain covered until Start, then receive normal clocks and results in tab memory. Closing/reloading loses them and permits another attempt. A persistent store that fails later keeps the existing failed-save rules; it never switches to unsaved play. See rule 15 and slice 2's opening capability check. |
| 2026-10-10 | A board served by a corpus clamp plays casually and uncovered, with its honest served-date label (user, 2026-10-10). | A badly wrong clock must still produce a playable board. Carry the response's clamp provenance into its daily binding; genuinely future, unclamped boards remain covered and cannot Start. Required before activation; keep the fix separate from commit 4's session hooks. |
| 2026-10-10 | Narrow the casual exception to `clamped === 'before'` (user, 2026-10-10), superseding the broader clamp wording above. | An after-clamp can serve yesterday's live challenge when publication is late. Apply ordinary device-date window rules there: covered and timed within the window, casual when older. Never expose the same live puzzle casually through today's corrected view. |
| 2026-10-10 | Prevent early access to future boards; low priority for later. Past boards need no restriction (user, 2026-10-10). | Record D16's release/exposure requirements now. The current device-date guard and public month files cannot enforce this against changed clocks or direct reads. No release architecture, trusted date policy or implementation is approved yet. |

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
| D2 | Ruleset v1, written first *(codex R1)* | Define start, finish, first-attempt rule, assists, reload, a hidden tab and errors, before any time is saved. Decided so far: Undo and Reset are allowed; a hint, or a Check, costs that board's time only, and the board can still be finished, marked as hinted; a size with a board unsolved or given up shows a partial result, not a total (user, 2026-10-09). There's no give-up button: a started board left unfinished counts as given up when its date leaves the today-or-yesterday window, and its clock runs until then (user, 2026-10-09). D2 must also say what happens to boards already seen or played before the challenge ships: they can't honestly become unseen first attempts (codex). Store the ruleset version with every result, so a later change never reinterprets old times. | Design first | Yes: Ruleset v1 below, accepted (user and codex, 2026-10-09). Slice 2: codex builds, Claude reviews (user, 2026-10-10); contract accepted by Claude at `4376e7d` (2026-10-10); commits 1 and 2 accepted by Claude at `ba0b18c` and `6591360` (2026-10-10). Timed but unsaved where no backend is usable at opening, approved by the user (2026-10-10); later save failures retain retries. Commits 3 and 4 accepted by Claude at `34f792f` and `8b1e435`; remove two redundant additions in a separate review correction. Only before-corpus-clamped boards stay casual/uncovered (user, 2026-10-10), narrowing the earlier decision; after-clamps retain ordinary date-window rules. Revised separate correction awaits Claude review before activation. |
| D3 | The clock starts at the reveal *(codex R2)* | Each challenge board loads covered; pressing Start reveals it and starts its clock in the same step, so loading time never counts. Each board has its own clock, so the time between boards never counts. A new Start clears unmarked existing progress so the first attempt begins empty; an existing attempt resumes its own progress. | Medium | Yes; clear on new Start approved (user, 2026-10-10). |
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
| D16 | Prevent early access to future boards | Keep tomorrow's and later boards unavailable before their release, including direct content access and advancing the device clock. Past boards remain unrestricted. See the draft requirements below; stronger release protection requires withholding future readable content rather than only hiding the board. | Study first | Later, low priority (user, 2026-10-10). Requirements only now; release-date policy and implementation need their own decisions/contract. |

### Future-board release protection (D16): draft requirements, low priority

**User's scope (2026-10-10).** Prevent someone seeing or playing tomorrow's or later
boards early. Do not restrict past boards. This records a future requirement; it is not
part of slice 2, an accepted implementation contract, or a change to the no-server rule.

**What is possible today, read and inspected locally.** `DominoClient.tsx` requests the
device's `dayKey(new Date())`; moving that clock forward changes which published board
loads. The archive filters dates after its effective today, and the enabled challenge
refuses dates ahead of its device date, but neither supplies an independent date authority.
`CorpusSource` fetches `/puzzles/index.json` and whole public month chunks. Those chunks
include future days, including all nine boards for 2026-10-11 in the checkout inspected
on 2026-10-10. Reading that chunk exposes them without using the game UI. These files are
also in the public source repository. This is code/data inspection, not an adversarial
browser experiment; no future-board access protection is claimed by the current cover.

**Required outcome and acceptance evidence for a later contract.**
- Define an independently enforceable release boundary first. Local device dates and
  timezones differ, so decide when a board becomes public and what "future" means at the
  same instant for two players. A clock/timezone change must not release withheld content.
- Before that boundary, the readable future definition and any information sufficient to
  reconstruct it must be absent from public delivery: URLs, month chunks, page/build
  assets, preload/offline caches and public source/history or exposed generator inputs.
  A hidden grid, renamed file, client-side secret or additional UI guard alone is not
  evidence of this property. Already published copies cannot be made secret again.
- Prove absence by inspecting the actual release artifacts and direct content requests,
  not only by testing a disabled date button. Exercise advancing the device date/timezone,
  requesting a future date and downloading a current-month file before release; none may
  return an unreleased readable board. Include a genuine future-date control distinct
  from the approved casual corpus-clamp correction.
- At release, the intended board must become playable reliably. Keep published puzzle IDs,
  hashes and definitions stable; keep the past archive and saved progress accessible.
  Test month boundaries, extension/deployment and stale caches without exposing later days.
- A future design could investigate scheduled publication of only released static data,
  without a competitive game server. That is an option to study, not an approved solution:
  it still needs a trusted release schedule, a timezone policy and protection against
  exposure through source/history. Decide offline future-content availability explicitly.

**Limits/open choices.** Strong prevention is incompatible with shipping readable future
content publicly in advance. The current local-date/on-device rules remain on the honour
system until a separately reviewed release design meets the evidence above. No new server,
daily deployment scheme, encryption, timezone policy or corpus rewrite is authorized here.

### Ruleset v1 (D2): contract

**Why.** A time means nothing until the rules that produced it are fixed, so they're written
before any time is saved (codex R1). This is the rules only, not the screens: covering,
the clock's display, the result card, stats, sharing and streak UI come after, against it.
Drafted 2026-10-09 from the user's decisions above. Codex's first review (2026-10-09): six
corrections, all made below (two tabs, saving assists and failures, expiry without a fetch,
Undo after a win, clock errors, the legacy rule). Second review: four more (the storage
fallback, an unsaved finish, the legacy check's empty boards and its own writes, a sticky
clock error). Third review: four more (a failed clock-error save, the lost-finish policy,
the store, "saved" meaning a completed transaction). Fourth review: three more (the solve's
own date as evidence, and the fallback's store choice and legacy check, which the user
settled by accepting loss there; rule 15). All made below. Fifth review: the hint-against-
finish test in both orders; codex then called the plan ready. The two proposals, rules 5
and 13, were approved by the user on 2026-10-09, with codex recommending both. This is the
rules, accepted; each slice of the build gets its own contract and review before code.

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
5. **Clock errors.** A device clock moved backwards is detected in two ways only:
   - the finish is earlier than the start, which can catch a change made while the game was
     closed, but only one large enough to put the finish before the start;
   - while an attempt's page is open, checked every second and whenever the page becomes
     visible: since the last check, the wall clock (`Date.now()`) advanced at least
     **5 seconds** less than the page's monotonic clock (`performance.now()`). The 5 seconds
     is a chosen tolerance, not a bound on how far the clock can legitimately be adjusted:
     automatic and manual adjustments both happen, and a backwards change smaller than it
     isn't caught (codex). Only that direction is checked: sleep can stop
     the monotonic clock in some browsers, which makes the wall clock look *ahead*, never
     behind (codex checked this).

   A detected error sets a *clock error* flag on the attempt, saved at once and never
   cleared, like the assisted flag. Once saved (rule 16), a reload or another tab can't lose
   it. **If saving it fails**, the flag stays set in memory, is retried with every later
   save, and the player is warned; if the page closes before a save succeeds, the flag can
   be lost, and the game doesn't promise otherwise (codex).
   **Approved (user, 2026-10-09):** an attempt with that flag, once solved, gives *solved, time unavailable
   (clock error)*: the solve counts, with no time. Any other change, forwards or too small or
   made while closed without reversing the order, isn't detected and can alter a time;
   that's accepted under the honour system (Principle 5). The game doesn't claim to catch
   every clock change.
6. **The finish.** The placement that solves the board by the rules stops the clock, and the
   time is that placement's instant minus the start. It's accepted as the attempt's result
   only if, at that instant, the board's date is still inside the window and the attempt has
   no result yet (rules 1 and 8). Once fixed, the result never changes.
7. **Assists.** Using Hint or Check during an attempt marks it *assisted*, and the flag is
   saved (rule 16) *before* the hint or answer is shown, so Reset, leaving the board, or a
   reload never clear it (codex). If it can't be saved, the hint isn't given. The board can
   still be finished, and shows as solved with a hint, with no time. Undo and Reset are
   free: they cost only time.
8. **Giving up.** There's no give-up button. An attempt still unsolved when its date leaves
   the window (for a board dated the 9th, at local midnight starting the 11th) is *given up*,
   with no time. Its clock runs until then. Expiry doesn't wait for a fetch: every open of
   the app, and every finish, settles any attempt whose date has left the window as given
   up (codex), but only *after* rule 14's recovery of a lost finish has run, so a solve
   that was made in time is never settled as given up (codex). A board solved after the
   window, in a tab left open or offline, is a casual solve and never turns a given-up
   attempt into a result.
9. **A board's result** is one of: not started; in progress; solved, with a time; solved
   with a hint (no time); solved, time unavailable (a clock error, or a finish whose save
   was lost: rule 14); given up (no time).
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
    inside the window: with a time, with a hint, or with its time unavailable, whether from
    a clock error or a lost finish recovered by rule 14 (D9). The streak's own rules
    (freezes, milestones) are D9's, built later against this.
13. **Boards played before the challenge ships** (codex). **Approved (user, 2026-10-09)**, and an explicit
    exception to "today and yesterday are always timed": the first time the challenge
    version runs *on this device*, before any Start is offered, it looks once at the
    progress records of the boards inside the window on the device's date then. Every
    record that is valid for its board's definition (`progressFor`) is marked *played
    before the challenge*, an empty board included: a record exists only because the board
    changed, so an emptied one (place, then Reset) was played too (codex reproduced it).
    Such a board isn't covered, is untimed, and has no result: it doesn't count towards its
    size's total or the streak. In IndexedDB, the marks and the flag saying the check ran
    are written in one transaction (rule 15), so the check counts as done only if every
    write succeeded, and two tabs opening together run it once; if it fails, no Start is
    offered and it runs again on the next open. In the `localStorage` fallback it isn't
    coordinated (rule 15): two tabs can scan different progress, or straddle midnight, and
    a tab's new challenge progress can be mistaken for play before the challenge, leaving
    that board untimed. Accepted (user). `savedAt` is never used as the marker, since it
    changes with every move. A board with no record is treated as unseen, even if it was
    looked at, because looking leaves nothing to tell (Principle 5). A device's first run of the
    challenge version can be days after the release, so the window it covers is that
    device's today and yesterday, not the release's.
14. **What is stored.** Each attempt is one record, apart from progress and outside the
    14-day cleanup (D6): the puzzle id, the definition's hash, the date, the ruleset version
    (`1`), the start instant, the assisted and clock-error flags, and, once it ends, the
    result and the finish instant. A later ruleset never reinterprets a result saved under
    this one.

    **A finish that can't be saved** is shown, marked as not saved, and kept in memory with
    its original finish instant; it's retried on every later save, and a retry never
    overwrites a result another tab has saved meanwhile. Until it's saved, Undo, Reset and
    Play again are off on that board, so Practice can't begin and overwrite the solved
    board. The player is warned that it can be lost if the page closes. If it is, the next
    open finds an attempt in progress with no finish, and decides it from *solve evidence*:
    at the winning placement, the board's progress record also saves the instant and the
    device's local date of the solve (`dayKey` then), written with the board itself. The
    local date is what counts: `savedAt` alone can't say which calendar day a solve fell on
    once the player changes time zone (codex reproduced 2026-10-10T23:30Z inside an
    October 9 window in UTC but outside it in Jerusalem). This recovery runs before expiry
    settlement (rule 8). So:
    - solve evidence whose local date is inside the window: *solved, time unavailable*.
      This holds after the window has closed too, because the solve happened inside it, and
      it keeps the streak (rule 12);
    - solve evidence dated after the window: *given up* (rule 8);
    - no solve evidence survives (progress writes can fail independently): the attempt is
      in progress, its clock still counting from the saved start, and once the window has
      closed, *given up*.
15. **The store, and two tabs** (codex). Attempt records live in IndexedDB, and every change
    to one (Start, either flag, the finish, the given-up settlement, the legacy check) is a
    read-check-write inside one `readwrite` transaction. IndexedDB runs overlapping
    `readwrite` transactions one at a time across every tab of the origin (the spec's
    transaction scheduling: read, not yet tested; a two-tab test must show it before it's
    relied on), so the check and the write are atomic without any other lock, and two tabs
    can't both start an attempt, lose a flag, or fix two results. The record only moves
    forward: a saved start is kept, and a second Start resumes it; neither flag ever clears;
    a fixed result is never overwritten, and a tab whose finish arrives second shows the
    result already fixed. Other tabs re-read on a change notice (`BroadcastChannel`) and on
    regaining focus.

    **Where IndexedDB doesn't open** (some private modes), the tab saves attempts to
    `localStorage` instead, and it's still timed. The user decided this, 2026-10-09: "we
    just save and the user will lose it, no big deal". So the fallback promises less, and
    says so: nothing coordinates it. Each tab picks its store when it opens, so tabs, or one
    device on different days, can use different stores. Two tabs on one board can overwrite
    each other's start, flags or result after reading a stale record; a board can be given
    a second attempt, or a hint, a clock error or a result lost; and the legacy check isn't
    coordinated (rule 13). A single tab on a browser where IndexedDB works keeps every
    guarantee.

    **Amended 2026-10-10 (user):** if neither backend is usable when the tab opens, use
    tab memory: covered until Start, timed and given normal results, explicitly unsaved.
    Closing/reloading loses the attempt and result and permits another attempt. Choose this
    only at opening, after IndexedDB and localStorage capability checks; a chosen persistent
    store failing later retains rules 4, 5, 7 and 14 and never switches to memory. In memory,
    an operation is applied in this tab before reveal, with no claim of durable saving.
16. **"Saved" means the transaction completed** (codex). In IndexedDB a write counts as
    saved only on its transaction's `complete` event, not a request's `success`: a
    transaction can still abort after a request succeeds. Start reveals the board, a hint
    is shown, and the legacy check counts as done only after `complete`. In the
    `localStorage` fallback, saved means `setItem` returned without throwing.

**Tests this contract needs before IndexedDB is relied on**
- Two tabs with overlapping `readwrite` transactions on one attempt: one Start wins and
  the other resumes it; two finishes fix one result; and a hint in one tab against a
  finish in the other, in both orders (codex):
  - the hint commits first: the finish gives *solved with a hint*;
  - the finish commits first: that result stays fixed, the later hint's transaction
    finds it, sets nothing and shows no hint, and that tab shows the fixed result.
- A transaction aborted after its request succeeded: nothing counts as saved, the board
  stays covered (Start), the hint isn't shown, and the legacy check runs again.

**Not in this contract**
- The covered board's look, the clock's display, the result and share cards (D7), stats
  (D6), streak UI (D9), the run receipt (D11), the previous-best split (D12).
- The timer's behaviour on real devices (D13) and the input-fairness study (D14).

### Challenge slice 1, attempts and the clock: implementation contract

**Why.** The first piece of Ruleset v1 to build: the attempt record, its storage and the
clock, with nothing on screen yet. Chosen with the user and codex, 2026-10-09: saving is
what every later slice stands on, and it's where the review found the hard cases. Codex
reviews this contract before any code. First review (2026-10-09): the split and the dev
dependency accepted, with two corrections and two test requirements, all made below; then
ready to implement.

**What this slice builds.** A new folder, `app/challenge/`, used by nothing yet, so the game
behaves exactly as it does now: no screen changes, no visual baselines change.
- `window.ts`, rule 1: whether a board's date is inside the window on a device date, and
  when it leaves it. Pure, on `YYYY-MM-DD` strings (`dayKey`), with no time zone arithmetic.
- `attempt.ts`, rules 3 to 10 and 14: the attempt record and its result, and each change as
  a pure function from one record to the next: start, mark assisted, mark clock error,
  finish, settle as given up, recover a lost finish. Each moves only forward (rule 15): a
  change that would go backwards returns the record unchanged, and says so. Also a size's
  result from its three attempts (rule 10).
- `clock.ts`, rule 5: elapsed time from the saved start, and the clock-error check, given a
  wall clock and a monotonic clock as arguments: an error when, between two readings, the
  wall clock advanced at least 5000 ms less than the monotonic one.
- **The other clock-error path** (codex): a finish whose instant is earlier than
  `startedAt` gives *solved, time unavailable (clock error)* in `attempt.ts`'s finish
  itself, with or without any earlier check having run. A negative time can never be a
  result.
- `attemptStore.ts`, rules 13 to 16: reading and changing attempt records.
  - **IndexedDB**: one database, `dominoFill.challenge`, with an `attempts` store keyed by
    puzzle id and a `meta` store for the legacy check. Every change is one `readwrite`
    transaction that reads the record, applies the pure function, and writes the result,
    and it reports *saved* only on the transaction's `complete` (rule 16).
  - **The fallback**: where IndexedDB doesn't open, `localStorage`, one key per attempt
    (`dominoFill.challenge.v1.attempt.<puzzleId>`) and one for the legacy marks with their
    done flag. Saved means `setItem` didn't throw. Uncoordinated, as rule 15 accepts.
  - The store is picked when the tab opens and kept for that tab (rule 15).
  - After each saved change it posts the puzzle id on a `BroadcastChannel`, so other tabs
    can re-read; this slice only sends, and a later slice listens.
  - The legacy check (rule 13), as a function: given the window, the definitions of the
    boards inside it, and the stored progress records, it validates each record against its
    own board's definition with `progressFor` (hash, size, rocks, legal cells), marks the
    valid ones, empty included, and sets the done flag, in one transaction (codex). A record
    with no definition given isn't marked.
- Nothing is deleted: attempts sit outside the 14-day cleanup (D6). Nine small records a
  day.

**The record** (rule 14): `puzzleId`, `definitionHash`, `date`, `ruleset: 1`, `startedAt`,
`assisted`, `clockError`, and once it ends, `result` and `finishedAt`. A result is one of
*solved* with its time in ms, *solved with a hint*, *solved, time unavailable* with a reason
(*clock error* or *finish lost*), or *given up*. "Not started" is no record, and "in
progress" is a record without a result. A stored record that doesn't parse reads as no
attempt, so a Start can overwrite it: one corrupt record costs that board's attempt, under
the honour system, and nothing else. (Progress storage instead deletes unreadable records
when it prunes, `pruneStorage`; attempts are never pruned, D6.)

**Not in this slice**
- Anything on screen: covering, Start, the clock's display, results, Practice (rule 11).
- Wiring into `PuzzleSession` and `BoardsStore`: the finish on the winning placement, Hint
  and Check marking the attempt, and saving solve evidence with progress (rule 14). That
  changes `progressStorage.ts`, so it belongs with the wiring.
- Listening for other tabs' changes, and the streak (D9).

**A new dev dependency.** The unit tests run in Node, which has no IndexedDB. They'd use
`fake-indexeddb` (dev only, never shipped), which implements IndexedDB in memory, including
transactions from two connections, which stand in for two tabs. It's a simulation, so the
real browser is tested too, below.

**Tests**
- Unit, pure (`tests/challengeAttempt.test.ts`): the window on its edges (the board's date,
  the next day, the day after, a month end, a year end); every result and every forward-only
  refusal; the finish refused outside the window or after a result; the size totals and
  partials; the clock-error threshold just under and at 5000 ms, and forwards never flagged;
  lost-finish recovery for each of rule 14's three cases, judged by the solve's local date;
  a finish before `startedAt` giving the clock-error result with no check run first, and no
  result ever holding a negative time.
- Unit, store (`tests/challengeStore.test.ts`, with `fake-indexeddb`): saved only on
  `complete`, and nothing saved when a transaction aborts after its request succeeded;
  two connections to the same database from one factory (codex): one Start wins and the
  other resumes it, two finishes fix one result, and a hint against a finish in both orders
  (rule 15's tests); the legacy check marking valid records, empty ones included, and
  skipping a wrong hash, altered rocks and a malformed placement, all or nothing; the
  fallback's keys and parse-or-missing reads.
- Browser (`e2e/challengeStorage.spec.ts`, Chromium, two pages in one browser context, which
  share IndexedDB as two tabs do): the premise rule 15 rests on, measured rather than read:
  page A opens a `readwrite` transaction on a test database and keeps it busy. The test
  proves contention, not just order (codex): page B creates its overlapping `readwrite`
  transaction while A's is still active (A reports it active after B's creation), and A's
  `complete` fires before B's first request succeeds. This tests the
  browser, not our module, which nothing on screen uses yet; the two-tab tests through the
  module itself come with the wiring. The harness drives Chromium only, so Firefox and
  Safari aren't measured.
- Mutation-tested: a finish before the start given a time; the window off by a day; a
  backwards change allowed; saved reported on
  `success`; the threshold at 4999 or 5001; recovery using `savedAt` instead of the local
  date; the legacy check skipping empty boards.

**As built** (2026-10-09)
- `app/challenge/window.ts`, `attempt.ts`, `clock.ts` and `attemptStore.ts`, imported by
  nothing in the app. `fake-indexeddb` 6.2.5 is the one new dev dependency, with no
  dependencies of its own; npm 11.19 also moved some `"peer": true` markers in the lockfile.
- Choices inside the contract:
  - an attempt both assisted and flagged with a clock error finishes as *solved with a
    hint*: the hint is the player's own act, and neither result has a time;
  - a lost finish on an assisted attempt recovers as *solved with a hint*, not *time
    unavailable*;
  - a change's outcome says `committed` (the transaction completed, or `setItem` didn't
    throw), `changed`, and the record storage now holds; when not committed, the record as
    it was read.
- **Measured in Chromium:** B's `readwrite` transaction waited for A's even on a *different*
  store of the same database, which is stricter than the spec requires and harmless here,
  since every attempt is in one store. With B on a different *database*, B's write succeeded
  within a millisecond while A was busy, so the wait isn't A's request chain starving B.
  That finding changed one mutation: "B on another store" was caught only by the final value
  check, not by the overlap check; "B on another database" replaces it and is caught by the
  overlap check.
- **The order is proved by a read, not timestamps.** The first version compared the two
  pages' `performance.timeOrigin + now()`, and a gate run failed on it: B's success read
  0.1 ms before A's completion. Two pages' clocks don't agree that finely. Now A makes one
  last write only after it is released, and B's first request reads the key: B seeing that
  write means A had committed before B ran. What B read is recorded boxed, so "B hasn't
  run" can't be mistaken for "B read nothing" (the database mutation first passed the
  overlap check that way, and failed only later). 10 repeated runs per project passed.
- Tests: 28 pure unit tests, 15 store tests, and the Chromium test on both projects.
  Mutation-tested, 14 of 14 caught: a finish before the start given a time, the window off
  by a day, a fixed result replaced, a second Start restarting, a hint set after the result,
  saved reported on a request's success, the threshold exclusive, forwards flagged, recovery
  by the instant instead of the local date, settling before recovering, the legacy check
  skipping empty boards or running twice, a hinted solve keeping a time, and B on another
  database.
- No screen changes, so no visual baselines changed.

**Corrected at codex's review** (2026-10-10). Codex reproduced two gaps:
- **A stored attempt was checked for types, not sense.** `2026-02-31` passed, and its window
  quietly ended March 4; and a timed *solved* result on an attempt flagged both assisted and
  clock error passed, and would have counted towards a size's total. Now a date must be a
  real calendar date (`isDay`: it survives the round trip), `addDays` refuses one that
  isn't, and a result must agree with its record: a timed solve has neither flag and a time
  of exactly finish minus start; a hint needs the assisted flag; *time unavailable* is never
  on an assisted attempt, and a clock-error one needs that flag; every solve has a finish
  instant, and no other state does. A test checks that every state the changes produce
  still passes.
- **A record wasn't bound to its key.** An otherwise valid record of another board, stored
  under this board's key, was resumed by Start. In both backends a record now reads as an
  attempt only under its own puzzle's key, and a change that would file a record under
  another key saves nothing.
- And a comment claimed a shortened time can never become a result: an undetected clock
  change still can, as rule 5 accepts.
- Mutation-tested, 7 more, all caught: an impossible date accepted, no consistency check, a
  timed solve on a flagged attempt, a time disagreeing with finish minus start, another
  board's record read, and each backend filing under another key. With the first 14, 21 of
  21. (The first 14's "saved on success" probe was rewritten to the moved code and caught.)

### Challenge slice 2, session wiring: implementation contract

Written for: Claude, reviewing codex's slice-2 contract and implementation.

**Status (2026-10-10): contract and implementation commits 1–4 accepted by Claude. The separate review correction removes two redundant commit-4 additions and is built/gated, awaiting Claude review before commit 5. The user chose a before-clamp-only exception; its revised correction contract awaits Claude's acceptance before clamp code.**
The user assigned this slice to codex; Claude reviews both this contract and the code.
Branch: `feature/challenge-wiring`, from `master` at `11b87a1` (PR #9's merge).
Plan corrections were recorded before implementation. Code-review corrections are recorded
under the owning commit's As built notes before the next implementation commit.

**First review, Claude (2026-10-10), on `aa732fc`.** Claude read the cited code and fixture
precedent; no tests or CI rerun. This revision scopes the progress retry to enabled roots,
excludes Practice solve evidence, records the archive-mark presentation work for slice 3,
and drops the unreachable first-solve Undo and its probe. It also removes chat titles from
the decision log, states what the non-cryptographic hash establishes, cites the existing
browser harness and sets out a commit sequence. The user approved clearing unmarked
pre-existing progress on a new Start (2026-10-10); the ordering, progress association and
regression cases below implement that decision. Claude accepted the revised contract on
`4376e7d` (2026-10-10), reading the plan only; Claude did not rerun the gate. Codex independently
checked CI run `38007303802`: success on that exact head. The reviewers' recommendations
are not product decisions.

**Commit-2 review, Claude (2026-10-10), on `6591360`.** Accepted, with a product question
before the coordinator is built: when neither IndexedDB nor localStorage is usable,
`localStorageStore(null).readAll()` returns `null`, and item 4's initialization retry
would leave challenge boards permanently covered. The earlier acceptance of losses in
unreliable fallback storage does not decide this case. The user must choose covered with
an explanation, timed but unsaved, or untimed; record the answer in the decision log,
D2 and the affected contract rules/tests before implementing commit 3. No choice has
been inferred from Claude's recommendation. **Resolved by the user (2026-10-10): timed but
unsaved, detected at tab opening; later persistent-store failures retain their existing
rules.** The user authorized proceeding with commit 3 after recording this clarification.

**Commit-3 review, Claude (2026-10-10), on `34f792f`.** Accepted as code. Claude reports
running six affected/dependent suites: 183 tests passed, unit stderr 0 bytes; type-checking
passed. Claude read the enabled-only integration, opening capability and coordinator rules,
but did not rerun the gate or 64-probe sweep. Codex independently checked CI run
`38022117973`: success on that exact head. Claude authorized commit 4 and requested shorter
coordinator lines and one statement per line; format that file with the session hooks.
Claude also found the before-corpus clock case: binding the clamped served date makes it
look genuinely future, so it stays covered forever. The user approved casual, uncovered
play for corrected boards, with the existing honest label (2026-10-10). This does not
change the genuine-future rule. The separate correction and its contract are below;
Claude explicitly says it does not block commit 4.

**Commit-4 review, Claude (2026-10-10), on `8b1e435`.** Accepted as code. Claude
reports seven suites passing (328 tests, unit stderr 0 bytes), type-checking 0, and
7 of 9 deliberate probes caught; Claude did not rerun the full gate or the 93-probe
sweep. Codex independently checked CI run `38056644197`: success on that exact head.
The uncaught additions are the celebration eligibility guard and the day-change
navigation counter. Claude accepts removing them or demonstrating their necessity;
they do not block the fixture commit. Keep the correction separately reviewable.

**Review correction contract, before code (2026-10-10).** Remove the redundant
`canCelebrate` call (`BoardsStore.ts:178–180`) and helper (`coordinator.ts:190–194`).
Enabled hydration already marks a restored winning board complete inside its action
(`restoreAttemptProgress`, `coordinator.ts:395–403`), so the ordinary completion reaction
does not celebrate it again. Successful placements still celebrate without awaiting
the finish save. Do not construct an impossible unstarted winning board to justify
an unused guard. Remove only `setDay`'s navigation counter increment
(`BoardsStore.ts:266`): changing day drops unserved sessions (`BoardsStore.ts:477–479`),
and the request's selected-session check rejects the old answer. Keep level/difficulty
increments, because going away and back there reuses the same session.
- Add two reachable regressions in `challengeSession.test.ts`: reload a saved, correctly
  stamped winning board whose saved completion flag is false, then select it and verify
  completion normalization produces no second celebration or altered result; delay a
  real committed Hint outcome while navigating day A→B→A, and verify a new A session
  replaces the old one and no old answer is published.
- Mutation-test the assurances that make these additions redundant: drop winning-board
  completion normalization and retain unserved daily sessions. Each must fail its
  corresponding regression at the intended assertion. Keep existing placement,
  finish-delay and level/difficulty navigation tests unchanged; run the cold gate.
- Scope: two removals and their regression evidence only; no clamp behavior, fixture,
  pixels, public activation or product decision. Record actual results in As built
  notes. Claude's review explicitly authorizes these removal alternatives under the
  accepted session contract; this is not a new product choice.

**Clamp-plan review, Claude (2026-10-10), on `f622f72`.** The proposed exception for
every clamp also exempts `clamped: 'after'`. If publication is a day late, the served
last published day is yesterday's live challenge, exposing it without Start in today's
view. Claude recommends only a before-clamp exception; ordinary date-window rules
already handle after-clamps. This is advice, not the user's decision. Leave the
existing decision/contract unchanged pending the user's answer; do not implement it.
**Resolved by the user (2026-10-10): before-first-day only.** The decision row, D2
and separate contract below now explicitly retain ordinary rules for after-clamps,
including the last-published-day + 1 control and a widening-exception mutation.
Submit the revised contract to Claude before implementation.

**Why.** Slice 1 supplies the attempt rules, transactions and clock arithmetic, but no
game code uses them. This slice connects those rules to real sessions and progress, behind
an inactive production setting. Slice 3 supplies the covered board, Start, clock, save
warnings, result and Practice presentation before switching that setting on. Turning on
timing while the public board is already visible would break rules 2 and 4.

**How it works today (read in code, not newly tested for this draft)**
- `RootStore.ts:32` constructs the store graph per provider mount; `provider.tsx:13`
  supplies it. Neither starts or disposes a challenge service.
- `BoardsStore.ts:253` builds nine definitions with a separately known `DayEntry.date`;
  `reconcileSessions` at line 445 retains matching sessions and restores progress before
  exposing new ones. Definitions have opaque IDs and hashes, but no date field
  (`PuzzleDefinition.ts:9`). The date must be passed from the day, never guessed from an ID.
- `PuzzleSession.ts:667` is the common placement method for tap, drag, keyboard and Pick a
  piece. Removal, Reset and Undo are separate mutations (lines 1127, 439, 1160); Undo can
  restore a solved board. Completion is observed later by the visible-session reaction in
  `BoardsStore.ts:172`, which sets `completed` and celebrates. That reaction is not the
  winning move's timestamp, and it observes only the current board.
- `PuzzleSession.ts:313` and `:318` compute and publish Check/Hint synchronously, without
  saving assistance. `GameControls.tsx:65` calls those methods directly; keyboard Undo
  calls the same `undo()` as the button. Play again calls `reset()`
  (`CompletionCard.tsx:122`). Tutorial constructs its own session (`Tutorial.tsx:17`).
- Progress v2 contains hash, board, completion and `savedAt`
  (`progressStorage.ts:42`); `progressFor` at line 131 validates it against a definition.
  `BoardsStore.ts:407` writes only locally changed sessions, but advances its baseline
  even if `writeProgress` fails. There is no solve evidence or failed-write retry queue.
- `openAttemptStore` (`attemptStore.ts:317`) chooses a backend per tab; `change` reports
  success only after transaction completion. Broadcast notices are sent, not listened to.
  It has no enumeration method. `attempt.ts` supplies `start`, both flags, `finish` and
  recovery-before-settlement through `reconcile`; the result is forward-only.
- The raw device date is `dayKey(new Date())`. The fetched day can be clamped or held back
  (`BoardsStore.ts:197`; `DominoClient.tsx:54`; `useDayRollover.ts`). Archive marks currently
  derive from progress, not attempts (`dayMark.ts:33`; `Archive.tsx:161`).

**Activation boundary and ownership**
1. Add a per-`RootStore` challenge coordinator in `app/challenge/`, with injected clock,
   storage opener and lifecycle dependencies for tests. An explicit constructor option
   enables it; the default is **false**, and the public provider never enables it in this
   slice. No URL, storage value or public control can enable it. Disabled means no attempt
   database open, legacy check, listeners, timers, assistance writes or new solve metadata.
   Ordinary sessions and Tutorial keep their current behaviour. This is a temporary build
   boundary, not a new player-facing choice to play today's boards untimed.
2. In enabled roots, bind daily sessions by puzzle ID, hash and the day's explicit date.
   Tutorial and standalone sessions without that daily binding stay casual. The coordinator
   keeps attempt state and pending saves by identity, independently of the selected level;
   switching difficulty/date cannot move a pending operation onto another session.
   Retire unserved bindings after their pending saves finish; permanent history belongs in
   storage, not an ever-growing session map.
   It owns the backend, one BroadcastChannel, focus/visibility listeners and a one-second
   timer. Mount/start and disposal must tolerate React's setup-cleanup-setup lifecycle;
   stale asynchronous completions cannot reopen a disposed service or attach to a newer
   session. Close the database/channel and cancel timers/listeners on disposal.
3. Expose presentation-neutral state for slice 3: initialization/retry state, legacy status,
   covered/revealable state, attempt/result, save errors, elapsed time, Practice state and
   action availability. Expose Start and retry operations, not a hidden automatic Start.
   The enabled-session model rejects board-changing actions before initialization or a
   saved Start, even if called directly. Slice 3 must also omit cells, targets, previews,
   pieces and their accessible descriptions until revealable: an inert visible grid alone
   would disclose the puzzle. This slice does not claim to implement that public cover.

**Initialization, legacy play and opening boards (rules 1–4, 8, 13–16)**
4. Before offering any Start, read an already committed legacy check. If absent, obtain the
   complete published definitions for the device's today and yesterday, including a month
   boundary, using the existing corpus source. A missing/failed required load or failed
   legacy commit leaves initialization retryable and offers no Start; a partial scan is
   never marked done. Use actual requested calendar dates, not clamped substitute dates.
   Dates outside the published corpus supply no challenge boards. If the local day changes
   while definitions load, prepare the new window before scanning.
   Scan current progress synchronously inside `legacyCheck`'s callback, after the existing
   v1 progress migration; validate with `progressFor` and include valid empty records.
   IndexedDB serializes the single check; a second tab uses the first committed marks and
   never rescans challenge play. The accepted uncoordinated fallback stays uncoordinated.
   Marked boards are untimed and uncovered, with no challenge result.
   **Opening capability check, approved by the user (2026-10-10):** `openAttemptStore`
   first attempts IndexedDB's existing completed-transaction probe. If that fails, obtain
   localStorage and probe a fresh temporary key with write, matching read, and removal;
   never overwrite existing keys. A missing/throwing API or failed probe selects an
   explicit `memory` backend for this tab. The coordinator reads this backend kind; a
   `readAll()` failure is not a capability signal. The backend choice is fixed for the
   service's mounted lifetime, including a setup-cleanup-setup lifecycle; later failed
   reads, Starts, assists, flags, finishes and progress writes on a persistent backend
   stay retryable under rules 4, 5, 7 and 14, never silently enabling another attempt.
   The memory backend runs the same pure attempt steps and one-time legacy scan in memory,
   with no BroadcastChannel/storage coordination. Its `committed` outcome means applied
   in this tab, not saved durably. Expose `unsaved` separately from a failed-save error.
   Start still begins empty and enables timing; assists, results, Practice and expiry
   follow the same rules. Challenge-bound progress/evidence stays in memory and is never
   sent to localStorage in this mode, including if storage later becomes available.
   Reload/new tab has a fresh backend and no retained attempt/result. Surviving old casual
   progress, if readable at opening, still participates in the legacy scan. Definitions
   must still load completely before that scan; a network failure remains retryable.
5. Start captures a wall instant and its local date at the press, then invokes slice 1's
   transactional `start`. Reveal only after a committed, identity-matching outcome with
   an attempt. An existing start is resumed, not replaced. Failed or aborted saves reveal
   nothing; a retry makes a new Start request unless another tab has already committed one.
   Also recheck the live local date when the outcome arrives: a board whose window closed
   while the save was pending becomes casual after reconciliation, rather than beginning
   a newly playable challenge. No loading time is added before the press, and no start
   is synthesized when selectors, Next, archive, reload or a refetch expose a session.
   **Approved by the user (2026-10-10):** if this is a new
   attempt with existing progress but no legacy mark, Start reveals the definition's empty
   board, discarding that progress at the reveal boundary. An old-version tab left open
   after the one-time legacy scan can write such progress, as can the accepted fallback.
   This loses that board's casual progress; it is not a new scan that silently makes the
   board untimed. Marked legacy boards remain untouched, and an existing attempt resumes
   its own progress.
   **Save ordering and progress association:** commit the attempt first; failed or aborted
   Starts preserve the old progress. After a new committed Start, clear the local board,
   completion, Undo history and evidence, and write empty progress in the same synchronous
   action that makes the session revealable. Tag enabled progress belonging to an attempt,
   including later Practice progress, with optional `attemptStartedAt`, equal to that
   attempt's saved start. Casual/legacy records remain compatible without this field.
   There is no atomic transaction across IndexedDB and progress localStorage. If the empty
   progress write fails, reveal the empty board from the committed attempt and retain the
   enabled retry. On reload/resume, restore only validated progress with the matching
   identity, hash and `attemptStartedAt`; missing/mismatched stamps mean an empty definition,
   never the old pre-filled board. Thus a later old-version write cannot become timed moves.
   A duplicate/concurrent Start that finds an existing attempt must not clear that
   attempt's matching progress. Re-read progress at the committed outcome: if another tab
   has already saved moves for that same new attempt, resume those instead of clearing
   them. A delayed empty-write retry must likewise adopt matching progress saved by another
   tab while this session remained locally untouched. Once locally edited, the accepted
   same-puzzle last-write-wins behaviour still applies. The stamp associates progress with
   an attempt generation; it is not cryptographic protection or a new fallback lock.
6. Add `readAll()` to `AttemptStore`, in both backends, returning only validated, key-bound
   records (an array on success, `null` on read failure). A genuinely empty store returns
   `[]`; discard collected records if the scan fails, so initialization can retry rather
   than silently missing history. The fallback retains its accepted lack of an atomic
   cross-tab snapshot. Initialization reconciles every unfinished saved attempt, not just the nine
   fetched boards. On focus, visible return and the one-second check, refresh the raw
   device date and reconcile expired attempts without waiting for a day refetch. Enumerate
   permanent history on initialization, focus and a changed local date, not every timer tick.
   Recovery runs before settlement inside the same `change` transaction. All decisions
   use that record's board date; a cached `today` cannot extend the window. An older board
   stays playable casually; a future board is not authorized as a challenge.

**The move and its saves (rules 5–8, 14, 16)**
7. Hook successful `placeToward` placements, rather than the completion reaction. Capture
   the clock and local date synchronously when a placement first makes an active attempt
   solved by the board rules, before any await, reaction, animation or storage callback.
   Cover all tap, drag, keyboard and Pick a piece paths through that method; rejected input,
   hydration, selection and `setCompleted` must not create a finish. Freeze that original instant
   in a per-board pending finish and gate further board mutations immediately. The
   existing completion celebration remains one celebration, independent of save latency.
   **Correction after review:** there is no reachable first-solve Undo to test under this
   lifecycle: a placement captures every first solve, pending finishes block Undo, a fixed
   result makes Undo Practice, and opening recovers a lost finish before play. Undo still
   recomputes board completion and participates in Practice, but cannot invent a new first
   finish. Do not construct an impossible no-result solved-history state to test one.
8. Save solve evidence with the solved board in the same progress `setItem`, before
   awaiting the attempt finish. It contains `solvedAt`, `solvedOn`, plus the definition's
   row/column targets as a small validation snapshot. These targets let recovery reconstruct
   the canonical definition from the saved rocks/targets, check its hash, legal/full board
   and matching sums without a corpus fetch. Recovery also binds that progress key/hash to
   the attempt, including a matching `attemptStartedAt`. It never uses `savedAt` as the
   solve's local day.
   The 32-bit FNV-1a hash checks association with the canonical definition; it is not
   cryptographic tamper protection. These validations and the on-device attempt rules
   remain on the honour system, including against forged evidence.
   **Amended progress-format choice:** extend v2 with optional evidence and `attemptStartedAt`,
   retaining its keys and all existing records; an old reader already ignores unknown fields. Replace the
   current "bump for any shape change" comment with the actual compatibility rule: an
   optional, independently validated field requires no migration, whereas changed required
   meanings do. The optional stamp must be a finite instant. Bad optional metadata is
   discarded without discarding an otherwise valid casual board; enabled attempt restoration
   still requires a valid matching stamp. Bad evidence is discarded independently.
   A valid evidence field requires a finite instant, real local date, matching canonical
   hash and an actually solved board. Clear evidence when the saved board becomes unsolved
   or Practice begins; a restored solved flag alone never manufactures it.
   Only a first-attempt solve can write this evidence. Practice solves and casual/legacy
   solves write ordinary progress with no first-attempt solve evidence, even when their
   board becomes full and `completed` is true.
9. Finish uses a transaction against the latest attempt, merging this tab's pending sticky
   clock-error flag before slice 1's `finish`. Any assistance already committed by another
   tab is respected. If a result was already fixed, adopt it and discard the competing
   pending finish. A result whose finish falls after the window never counts: recover any
   earlier durable evidence first, otherwise settle as given up and treat the new solve as
   casual. The attempt's original result is immutable.
10. A failed finish remains pending with its original instant/date and flags; expose
    "not saved" for slice 3. Undo, Reset, Play again and other board-changing calls remain
    blocked until the finish is committed or another tab's fixed result is adopted.
    Navigation is permitted, but does not discard this pending state. Retry on explicit
    request, later saves, focus/visible return and the one-second timer, with at most one
    operation per puzzle in flight. There is no switch of backend after a write failure.
    A successful finish need not wait for a successful progress save; the two stores are
    independent. Keep failed progress snapshots for retry, removing them only when their
    exact generation commits or a newer local mutation supersedes them. Untouched sessions
    must never overwrite another tab's progress.
    **Scope:** progress retry and write-generation tracking run only for challenge-bound
    sessions in enabled roots (including their later Practice/archive state). Disabled
    roots and unbound casual/Tutorial sessions retain today's persistence behaviour:
    `persist` advances its baseline even on a failed write. A general casual retry fix is
    a separate change, and this slice does not silently make it.
    In the explicit memory mode, enabled progress is retained only in tab memory without
    a persistent-write retry queue. Never interpret later persistent failures as memory mode.
11. On reopening, use only validated solve evidence that survived with progress and matches
    the saved attempt's start stamp as well as its key/hash. Run slice
    1's `reconcile` before expiry: an in-window lost finish is hinted if assistance was
    saved, otherwise time unavailable; after-window evidence gives given up; absent evidence
    leaves the saved start running, or gives up after expiry. No recovered timed result,
    no invented finish timestamp, and no inference from the current timezone. If progress
    saving also failed, recovery cannot promise a solve. The existing 14-day progress
    retention stays; permanent attempts and legacy marks are never pruned with it.
12. Enabled `hint()` and `check()` use the same save-before-reveal boundary, including direct
    session callers. Freeze that session's board-changing input while the assistance
    transaction is pending, and publish advice only after a committed outcome that still
    has an in-progress matching attempt in the window. Already assisted is sufficient;
    `changed: false` alone does not mean refusal. If a concurrent finish won, adopt its
    result and show no advice. Failures show no new answer and permit retry; navigation or
    disposal suppresses an obsolete answer. Never delay a casual/Tutorial answer for storage.
    Preserve the casual methods' existing synchronous contract; enabled callers use an
    explicitly asynchronous request path behind the same public action guard.
13. The one-second timer and visible return compare wall/monotonic readings with slice 1's
    `wentBack`. Keep a detected clock error sticky in memory immediately, attempt its save
    at once, and merge it into every later transaction including finish. A read or failed
    save cannot clear a pending flag. Track all initialized unfinished attempts owned by
    this root, including ones not selected; switching boards never resets their clock.
    A reload establishes a new monotonic baseline and resumes from the saved wall start.
    Do not claim to detect forwards/small/closed-page changes beyond Ruleset v1.

**Practice, marks and other tabs (rules 10–12, 15)**
14. Inside the window, the first successful board-changing action after a fixed result
    starts Practice at that action's instant, from the resulting board. Reset/Play again
    and Undo retain today's history semantics. A refused move or empty Undo starts nothing.
    Practice has its own running wall clock; solving it freezes only that Practice time,
    and the next successful change begins another run. Reload/navigation may discard a
    Practice clock, since it is not a saved result, but a restored editable post-result
    board must begin a new Practice clock before its first mutation. It never revises
    the attempt or the challenge finished mark. After expiry the session is casual.
15. Supply challenge completion/size-result selectors from attempts: solved, hinted and
    untimed count as finished; given up and not started do not. Enabled first-unsolved
    selection uses those fixed results, not a Practice board's `completed`. Keep the
    existing casual/legacy marks. Expose data needed by the future archive/results UI;
    this slice does not rewrite the public archive presentation or build streaks.
16. Listen to validated puzzle-ID notices on slice 1's channel and re-read storage; a
    message is a trigger, never trusted record data. Also re-read on focus/visible return
    and fallback `storage` changes. Serialize this tab's operations per puzzle; stale read
    completions cannot replace newer local state or clear pending flags/finishes.
    Fixed results dominate this tab's competing result. Reconcile affected inactive sessions
    too. Do not copy another tab's board over locally edited progress: progress retains
    its accepted same-puzzle last-write-wins behaviour. The localStorage backend retains
    the explicitly accepted cross-tab losses, with no stronger promise or new lock.

**Not in this slice**
- Public activation, cover/Start/clock/result/save-warning/Practice UI, sharing, stats,
  streak/freezes, receipts, new navigation choices or shortcuts, changed puzzle assets.
- Wiring the archive's visible challenge marks to the attempt selectors (item 15): slice 3
  must do this before activation. `markForDay` and `Archive` currently read progress;
  a Practice Undo clears that board's `completed`, so the existing presentation could lose
  its finished mark in an enabled fixture. Slice 2 protects the fixed result and derived
  challenge finished state; it does not claim that the old archive UI already consumes it.
- A general progress-retry fix for the public casual game; item 10 is enabled-root scoped.
- A fix for the known theme/archive flakes, native storage, real-phone timing claims or
  stronger fallback guarantees. Those need their own assigned changes.
- Pixel changes or baseline regeneration. The ordinary public page remains inactive;
  browser fixtures are compiled only in the existing visual-test build.

**Tests to add, and existing tests deliberately changed**
- New `tests/challengeSession.test.ts`: enabled daily binding versus casual/Tutorial;
  all placement paths capture the mutation's instant; save ordering and
  deferred/aborted Start/assistance; already-assisted success; exact pending-finish retries;
  each independent save failure; blocked post-win mutations; navigation during promises;
  identity/hash checks; stale-read suppression; lifecycle cleanup; clock flags; Practice
  mutation/no-op/reload cases, including Undo restoring a solved Practice board without
  a new first result or solve evidence; immutable results and derived finished marks.
  Start regressions cover clearing unmarked old progress (board, completion, history and
  evidence); failed/aborted Start preserving it; a failed empty write followed by reload;
  missing/mismatched stamps and later old-version writes; matching stamped progress resumed
  by duplicate/concurrent Starts; and an untouched empty-write retry adopting another tab's
  matching progress. Marked legacy progress remains untouched.
- New `tests/challengeLifecycle.test.ts`: both-window-day legacy definitions, month end,
  midnight during loading, empty valid legacy progress, failed/partial scans, simultaneous
  initialization, all stored attempts reconciled, recovery before offline expiry, retention,
  raw device dates versus fetched/clamped dates, and disabled roots performing no work.
- Extend `tests/challengeStore.test.ts` for `readAll` key binding/validation in both backends
  and latest-record reconciliation; retain slice 1's transaction-abort and conflict tests.
- Extend `tests/progressStorage.test.ts` and `tests/persistence.test.ts`: optional evidence/stamp,
  old v2 and v1 records preserved, malformed/unsolved/wrong-hash evidence ignored, targets
  validated without fetching, invalid stamp ignored for casual restoration and mismatched
  attempt stamps rejected for recovery, enabled-root write-generation retries, casual failure
  semantics preserved, Practice/casual solves emitting no first-attempt evidence,
  metadata included in change detection,
  unrelated puzzle keys unchanged, and failed progress writes never fabricating recovery.
  Existing assertions change only where they deliberately pin the new evidence/retry rules.
- Extend `tests/provider.test.tsx` for inactive default and enabled start/disposal ownership.
  Keep the existing casual controls/Undo/Reset/completion suites' behavioural assertions.
- New `app/visual/challenge/page.visual.tsx` and its fixture, behind the existing
  `DOMINO_VISUAL_SHEET` page-extension gate, exercise the real enabled store, sessions and
  board/control components with fixture Start/status controls. New
  `e2e/challengeSession.spec.ts` uses that compiled module in two same-origin pages: competing
  Starts, finishes and Hint/Check versus finish in both orders; hold a real transaction
  open so overlap is proved, not assumed; abort after request success and assert the cover
  model/advice/legacy retry; BroadcastChannel and focus reconciliation; real reload recovery;
  Practice preserving the first result. Compare storage observations, not timestamps across
  pages. Pin each date with `pinDay` before loading; keep animation clocks running.
  **Read precedent:** `e2e/server.ts:271` prepares the flagged visual environment, lines
  291–298 build both versions and serve the visual one on port 3101; `e2e/sheet.spec.ts:17`
  selects `VISUAL_URL`. The new fixture uses that existing `npm run test:e2e` harness,
  with no separate server or extra browser-test command.
- Extend `e2e/bundle.spec.ts`: the fixture route and its code are absent from the ordinary
  production build, including direct requests. Keep existing public-page behaviour tests,
  and add an explicit assertion to `e2e/challengeSession.spec.ts` that today's public page
  still plays casually with zero challenge records/legacy check. The fixture is not a claim
  that slice 3's public cover has been implemented.

**Mutation probes planned** (one at a time; expected assertion recorded with each run):
enable the public root; allow input before Start commit; reveal on request success;
retain unmarked old progress on a new Start; restore missing/mismatched stamped progress
into an attempt; clear matching progress on a duplicate Start; let an untouched empty-write
retry overwrite another tab's matching moves;
show assistance before its commit; reject already-assisted success; show a late hint after
a fixed result; timestamp the finish in the reaction/after await;
retry with a new finish instant; unlock Reset while a finish is pending; drop a failed
progress snapshot; recover from `savedAt` or the reopening timezone; accept unsolved or
wrong-hash evidence; settle before recovery; reconcile only fetched attempts; use fetched
`today` for expiry; clear a pending clock flag on re-read; omit that flag from finish;
skip empty legacy records; mark a partial legacy scan done; rescan after committed migration;
let Practice overwrite the result/finished mark; start Practice on a refused move; let a
stale read or old-session advice publish; miss BroadcastChannel/focus refresh; leak a timer
or attach after disposal; ship the fixture in production; write first-attempt evidence on
a Practice solve; enable progress retry in a disabled root. The first-solve Undo probe is
removed as unreachable, not replaced with a fabricated-state test. Split combined probes
where their assertions differ. Record the exact tally and any probe caught by the wrong assertion;
strengthen that test, never weaken this contract.

**Planned implementation commits, after the whole contract is accepted**
1. Optional progress evidence/start stamp and their independent validation, with the
   parser/format tests.
   No producer yet, so no game behaviour changes.
2. `AttemptStore.readAll`, both-backend validation and enumeration tests.
3. The inactive coordinator, binding/lifecycle/legacy/reconciliation state and tests, with
   enabled-only progress retry. Default roots remain inactive.
4. Session action guards, Start, assists, winning-placement timing and Practice hooks, with
   the session tests and their mutations. Keep these together: a guarded session must not
   briefly ship with an unguarded direct Hint/Check or an uncaptured winning placement.
5. The visual-only fixture, integrated Chromium cases and production-exclusion assertions.
  Runtime tests accompany their owning commit rather than waiting for this final step.

**Required separate correction before activation: before-corpus clamp only (2026-10-10)**
- Why/read: `CorpusSource.loadDay` deliberately returns a playable endpoint and reports
  `clamped` for an out-of-range requested date (`corpusSource.ts:155–169`). `receiveDay`
  retains the honest effective/requested dates, but daily challenge bindings currently
  receive only the served date. `isCovered` therefore mistakes a before-corpus correction
  for a genuine future puzzle. Nothing is publicly enabled yet.
- Carry each served response's explicit clamp provenance into its binding. Do not infer it
  from the opaque puzzle ID, a global selected date, or merely being ahead of the clock.
  Only a binding served through `clamped === 'before'` is casual/uncovered: no Start, first-attempt mutation,
  Practice clock or first-attempt solve evidence from that response. Keep its served-date
  label and ordinary casual progress/assistance. An unclamped future binding remains
  covered and cannot Start. Existing fixed attempts are not rewritten by this exception.
  A response marked `clamped === 'after'` receives no exception: compare its served date
  to the raw device date as usual. In the today/yesterday window it remains covered until
  Start and timed; older served dates are ordinary archive. Thus a live puzzle reached
  through a corrected today view cannot preview the same puzzle reached as yesterday.
- Preserve matching-session/refetch behaviour, with provenance updated from the response
  that actually serves the board; pending responses must not change the active board's
  mode. Do not bypass unrelated initialization/save failures for ordinary challenge boards.
  Keep active and pending clamp provenance with their own served responses; `clockClamp`
  is global display information and must not decide another response's binding mode.
- Add before/after-clamp tests using `receiveDay`, an unclamped-future control, matching
  refetch and held-back-day assertions. Check casual placement/Hint/Check and absence of
  challenge writes/evidence; mutation-test dropped/inferred provenance and accidental
  permission for a genuine future day. No assets, pixels or public activation in the fix.
  Specifically, after-clamp with device date `lastDate + 1` must be covered with Start
  allowed; after Start its attempt is timed. Opening that same date explicitly produces
  the same challenge mode. At `lastDate + 2` it is casual. A mutation widening the
  exception from before-clamp to any clamp must fail the live after-clamp cover assertion.
- This is a separate atomic correction after the accepted commit-4 hooks, before slice 3
  can activate. The user's narrowed decision is final; present this revised concrete
  mechanism to Claude for acceptance before implementing that separate correction.

Each commit gets its own mutations for the mechanism it adds, full cold gate and As built
notes. Push it, let needed CI finish, and report the exact head for Claude's review before
the next implementation commit. If the accepted plan requires regrouping a dependency,
record it here first; do not push a temporarily enabled or partially guarded public game.

**Opening capability tests added to commit 3 (2026-10-10)**
- IndexedDB wins when its opening probe succeeds, without touching localStorage.
- A usable fallback passes its temporary-key probe, leaves existing keys unchanged and
  removes the probe. Missing/throwing localStorage, a write/read/remove failure or a
  readback mismatch selects memory; no unrelated keys are changed.
- Two memory stores are independent: Start, flags, result and legacy check work within
  one instance and vanish in a new instance. Memory mode performs no persistent writes
  or cross-tab notifications, and exposes unsaved state without retrying nonexistent saves.
- A chosen persistent backend failing initialization/readAll or later writes remains
  that backend and retryable; it never switches to memory. Disabled roots still open nothing.
- Mutations: choose memory after a later failed read/write; choose persistent fallback
  without its opening probe; retain a probe key; overwrite an existing key; persist or
  broadcast a memory operation; share memory across instances; bypass Start in memory mode.

**As built: implementation commit 1, optional progress metadata (2026-10-10)**
- Extended progress v2 in place with `attemptStartedAt` and `solveEvidence` (instant,
  local day, column/row target strings). Required fields, storage keys, v1 migration and
  retention retain their meanings. Both v2 parsing and v1 entry validation sanitize each
  optional field independently; malformed metadata does not discard a valid casual board.
- Evidence validation reconstructs the canonical definition from saved rocks/targets and
  requires its hash, a square full board, legal domino ownership and both target sums.
  It accepts evidence before the completion reaction (`completed: false`), preserving the
  saved instant/day rather than deriving either from `savedAt` or the reader's timezone.
  No corpus fetch, producer, coordinator or gameplay guard is added in this commit.
- Added `solveEvidenceFor` for future recovery callers: it revalidates evidence and requires
  the saved attempt's hash and finite matching start stamp. The caller must read progress
  under the attempt's puzzle ID; neither the hash nor stamp binds the storage key itself.
- Deliberate test changes: extended `progressStorage.test.ts` for format compatibility,
  independent malformed-field handling, canonical evidence checks and attempt association;
  extended `persistence.test.ts` for board/metadata in one write, unrelated-key preservation,
  refused-write preservation and ordinary gameplay emitting no challenge metadata.
  Added 51 cases: 48 format/validation cases and 3 persistence cases. In the cold gate,
  those two files passed 87 and 48 tests respectively (135 total).
- Preliminary validation: 133 targeted tests passed, TypeScript and targeted lint exited 0.
  After adding two explicit winning-instant/local-day assertions, the count is 135 in the
  full gate. The initial `npx` invocation was blocked by PowerShell script policy before
  tests ran; invoking `npx.cmd` succeeded. No source change was needed for that shell issue.
- Mutation sweep: **25 of 25 caught at the intended assertion**, source restored byte-for-byte.
  Probes: bump the v2 key version; trust a malformed stamp; omit stamp finiteness; drop a
  valid stamp; drop valid evidence; omit solve-instant finiteness; omit calendar validation;
  swap target axes; omit board fullness; omit square shape; omit domino legality; omit the
  definition hash check; omit rocks from reconstruction; omit column sums; omit row sums;
  replace the winning instant with `savedAt`; reconstruct the saved local day; discard a
  casual record for bad evidence; trust legacy metadata; accept the wrong attempt stamp;
  accept a missing attempt stamp; accept the wrong attempt hash; trust typed recovery
  evidence without revalidation; strip metadata on write; lose evidence during enumeration.
  Each probe ran its named regression test alone and checked the failed assertion's source
  location in Vitest's JSON report. Two harness setup runs stopped at probe 1: Windows
  command quoting selected zero tests, then the verifier expected assertion text absent
  from JSON's stack-only error. Fixed the harness to invoke Vitest through Node arguments
  and verify the reported source line; the final complete sweep had no weak/escaped probe.
- Commit-1 cold gate, first run: waited for the socket prerequisite (prechecks reached 240;
  the gate started at 99). TypeScript 0, lint 0 (no warnings), unit 0 (60 files, 1317 tests
  passed; stderr exactly 0 bytes), build 0 and browser 0 (651 passed, 1 existing conditional
  skip at `keyboard.spec.ts:184`, page not scrollable). No failed gate run. Build stderr:
  1512 bytes, stale `baseline-browser-mapping` warnings; browser stderr: 5246 bytes,
  `NO_COLOR` versus `FORCE_COLOR` warnings. `git diff --check` passed; only the storage
  module, the two named test files and this document changed, with no changed assets.
- The first precommit wrapper stopped before staging because an extra PowerShell array
  wrapper counted the JSON mutation array as one item. Corrected that wrapper and verified
  25 results, zero uncaught; this was a precommit-script error, not a failed gate or probe.
- **Code review, Claude (2026-10-10), on `ba0b18c`: accepted.** Claude reports rerunning
  the two changed suites (87 and 48 tests) and TypeScript, plus five scratch probes for
  good evidence, swapped axes, junk targets, wrong/missing tags and impossible dates.
  His first scratch control used a non-square board and failed; correcting that fixture
  produced five passing probes. Claude did not rerun the full gate or mutation sweep.
  Codex independently checked CI run `38012398426`: success on that exact head.
  Fixed the stale review wording above. The nonblocking suggestion to move `isDay` to a
  neutral date module is recorded for later consideration; commit 2 does not move it.

**As built: implementation commit 2, attempt enumeration (2026-10-10)**
- Added `AttemptStore.readAll(): Promise<readonly Attempt[] | null>` to both backends.
  IndexedDB enumerates the attempts store with one readonly cursor transaction and returns
  records only on transaction completion; abort, error or setup failure returns `null`.
  String keys are checked against each record's puzzle ID using the same validation as
  single-record reads. A bad record or non-string key is skipped and the cursor continues.
- The fallback enumerates only the attempt-key prefix, parsing and validating each record
  against the ID in its key. Missing storage or an exception from length/key/getItem returns
  `null`, discarding previously collected records. Corrupt JSON is an invalid individual
  record and is skipped. No writes, pruning, backend switch or new cross-tab lock is added;
  a fallback scan is not promised to be an atomic snapshot against another tab's edits.
- Both backends include permanent finished and unfinished history regardless of fetched
  definitions or board date, and re-read the latest committed flags/results on every call.
  No coordinator or gameplay caller is added in this commit.
- Deliberate test changes: extended `challengeStore.test.ts` by 23 cases (12 shared backend
  cases, 6 IndexedDB cases, 5 fallback cases), preserving its existing 18 cases. The new
  cases check empty versus failure, all dates/results/opaque IDs, malformed and misfiled
  records, unrelated namespaces, latest cross-connection writes, readonly completion,
  abort after cursor success, cursor setup failure, closed connection, corrupt JSON,
  untouched storage, absent storage and exceptions from length/key/getItem.
- Preliminary validation before strengthening the abort cases: all 40 targeted tests passed;
  TypeScript and targeted lint exited 0. The strengthened suite contains 41 cases.
- Mutation sweep: **26 of 26 caught at the intended assertion**, source restored byte-for-byte.
  IndexedDB probes: trust malformed records; ignore key binding; coerce non-string keys;
  stop the cursor early; lose the latest flags/result; omit finished attempts; filter out
  unserved dates; use readwrite; resolve on cursor success; return collected history on
  abort; report cursor setup failure as empty; report a closed connection as empty; return
  collected history on request error. Fallback probes: trust malformed records; ignore key
  binding; read unrelated namespaces; stop after a malformed record; skip the last key;
  swallow getItem failure; return collected history on length/key/getItem failure (three
  separate probes); report missing storage as empty; remove enumerated keys; rewrite valid
  records; fail the whole scan for corrupt JSON.
  The first sweep stopped after 10 probes: 9 caught, 1 escaped. The cursor-abort test had
  aborted with another request pending, so the error handler returned `null` before the
  broken abort handler could publish partial history. Strengthened it into separate pending-
  request and end-of-cursor abort cases and added a request-error probe. The complete rerun
  caught all 26 at their named regression assertion, verified from Vitest's reported source
  location; no weak or escaped probe remains. This changed the test, not the contract.
- Commit-2 cold gate, first run: socket count 38; TypeScript 0, lint 0 (no warnings),
  unit 0 (60 files, 1340 tests passed; stderr exactly 0 bytes), build 0, browser 1
  (650 passed, 1 failed, 1 existing conditional skip). Failure: phone-360,
  `archive.spec.ts:360`, "a clock past the corpus plays the last day and says so": the
  board did not render within 15000 ms. Diagnostics returned `hydrated: false`, readyState
  complete and body `no board`. That test's `openAt` helper bypasses `instrument`, so its
  elapsed `-1` and empty fetch/error/network lists do not establish that nothing failed.
  It also uses `page.clock.install` rather than the calendar-only `pinDay` helper. The
  startup failure's cause is not established; no `readAll` caller is added in game code.
  Build stderr: 1512 bytes of stale `baseline-browser-mapping` warnings; browser stderr:
  5410 bytes of `NO_COLOR` versus `FORCE_COLOR` warnings. No commit after this failed gate;
  rerun the entire gate from cold, leaving runtime/tests unchanged. Any startup-flake fix
  belongs to a separate assigned contract/change, as excluded by this slice's scope.
- Commit-2 cold gate, second run, runtime/tests unchanged: waited for sockets to drain;
  starting count 39. TypeScript 0, lint 0 (no warnings), unit 0 (60 files, 1340 tests passed;
  stderr exactly 0 bytes), build 0, browser 0 (651 passed, 1 existing conditional skip
  at `keyboard.spec.ts:184`, page not scrollable). The attempt-store suite passed 41 cases.
  Build stderr: 1512 bytes of stale `baseline-browser-mapping` warnings; browser stderr:
  5242 bytes of `NO_COLOR` versus `FORCE_COLOR` warnings. `git diff --check` passed;
  only the attempt store, its named test file and this document changed; no changed assets.
  The first failed browser run remains recorded above. This passing rerun establishes
  intermittency in the startup test, not its cause; separate diagnosis/fix remains required.
- Claude accepted `6591360` (2026-10-10). Claude reports independently running the
  attempt-store suite (41 passing tests) and type-checking, plus two passing scratch probes:
  IndexedDB enumeration rejects numeric keys, misfiled records and junk while matching
  individual reads; fallback enumeration ignores progress/lookalike keys and reports a
  thrown getItem as failure. Claude did not rerun the full gate or mutation sweep.
  Codex independently checked CI run `38014373602`: completed successfully on the full
  head `6591360f9209c9f2d903a54461d5c2808e8a7ba7`.

**Known flaky browser tests (separate changes, builder not yet assigned)**
- `e2e/theme.spec.ts:71`: a background was read as `[0,0,0]`; its parser also maps
  transparent to that value. Capture the raw CSS value when diagnosing it. This is the
  previously recorded failure, not a new run or a confirmed cause.
- `e2e/archive.spec.ts:360`, phone-360: board startup timed out during commit 2's first
  gate; the complete cold rerun passed. The failure and diagnostic limitations are
  recorded above; its cause remains unknown. Diagnose and fix under a separate assigned
  contract. Neither flaky test is silently skipped or fixed in slice 2.

**As built: implementation commit 3, inactive coordinator (2026-10-10)**
- Added an explicitly enabled, per-root coordinator. The public provider still constructs
  a default inactive root; its new effect owns start/disposal, with no challenge work in
  that default. Standalone/Tutorial sessions have no daily binding. Daily sessions bind
  to their definition and explicit corpus date; matching sessions survive refetches.
- Opening selects IndexedDB after its transaction probe, otherwise localStorage after a
  fresh-key write/readback/removal probe, otherwise a separate memory instance. Probe keys
  are collision-checked; cleanup is best effort if removal itself is blocked. An unavailable
  UUID API uses a different suffix and is not mistaken for blocked storage. `kind: memory`
  exposes explicitly unsaved play; its applied outcomes are not durable saves. A persistent
  backend remains selected through later failures and lifecycle reopen; failed IndexedDB
  reopen reports failure as IndexedDB rather than selecting another backend. Memory state
  survives effect setup-cleanup-setup within this root; a new root/store has none of it.
- Initialization completes the legacy check using both requested calendar dates, rebuilding
  the window across midnight and excluding clamped substitutes. Partial/failed loads and
  failed commits stay retryable. The scan includes valid empty records. Persistent roots
  retain migration and 14-day cleanup; memory roots read old casual progress without
  migrating/deleting it. All unfinished saved attempts reconcile transactionally, including
  unfetched IDs, with validated solve evidence before expiry. Failed history reads are
  failures, not empty history or a signal to switch to memory.
- Operations serialize by puzzle ID; adoption checks ID/hash/date and suppresses disposed
  completions. One timer and owned focus/visibility listeners provide raw-device-date and
  wall/monotonic checks. Persistent mode also listens to storage events and validated ID
  notices on BroadcastChannel, rereading records rather than accepting message data. Memory
  keeps local focus/visibility checks, with no cross-tab channel/storage-event coordination.
  Pending clock flags are sticky and merge into later transactions. New-session reconciliation
  failures can retry on the same store; stale operations cannot attach effects after disposal.
- Enabled daily bindings retain failed progress with a generation and original `savedAt`.
  A newer local snapshot supersedes it; completion of an older generation cannot clear the
  newer one. Only changed local boards/metadata queue writes. Retired bindings remain while
  progress or transactions are pending, then retire; this does not copy another tab's board
  over local edits. Memory progress stays in the root's map without persistent writes/retries.
  Disabled casual persistence still advances its baseline on failure and does not retry it.
- Fixed attempt results drive challenge first-unsolved selection despite a changed replay
  board; casual archive completion still counts after a given-up challenge. Newly served
  results reconcile before selection, and a delayed completion cannot override navigation
  made meanwhile. The archive's visible marks remain slice 3's work.
- The Start/assist/finish action guards, winning-placement capture, Practice producer/state,
  empty-on-Start ordering and pending-first-finish retention are still commit 4, together as
  accepted. This commit provides their serialized transaction/binding/persistence foundations;
  it adds no public activation or fixture and does not claim those later hooks are built.
- Deliberate tests: added `challengeOpening.test.ts` and `challengeLifecycle.test.ts` for
  capability selection, independent unsaved records, initialization, history/evidence,
  lifecycle, clock flags, binding retries, progress generations, retention and selection.
  Added one provider setup-cleanup-setup ownership test. Existing persistence/store tests
  keep their assertions; new enabled persistence cases live with the coordinator lifecycle
  tests so their injected store/clock/write failures share the same harness.
- Preliminary targeted run: 48 of 50 passed; two failures. The month-boundary fixture's
  timestamp was outside retention and was corrected. A real missing-observability problem
  in the optional start stamp was corrected by initializing it explicitly. The next run
  passed all 145 tests across five suites; later additions and their counts are recorded
  with the final checks below. Targeted lint initially found one prefer-const error and
  unused imports/parameters; corrected them, without weakening any contract rule.
- Own read-through found and corrected three additional issues before the gate: the opening
  mode needs observability even when read before initialization; a newly bound session needs
  a retry path after temporary failure; unsaved mode still needs local focus clock checks.
  Added independent regression assertions and mutation probes for each. Probe entropy,
  persistent cleanup and delayed first-unsolved selection also have regression probes.
- Final targeted validation: **161 of 161 passed** across five suites: opening 17,
  lifecycle 48, provider 7, existing attempt store 41 and persistence 48. Added **66 tests**
  over commit 2 (17 opening, 48 lifecycle, 1 provider). Intermediate strengthened runs
  passed 147, 152 and 156 tests as cases were added. One intermediate type-check failed
  because a zero-argument mock's call tuple was indexed for the new listener mode;
  giving the mock the listener's actual signature corrected it. The full cold gate below
  checks the final types/lint as well as all tests.
- Mutation sweep: **64 of 64 caught at their intended assertion**, source restored
  byte-for-byte. Probes:
  - 1–4: enable default roots; bypass Start in memory; reveal a stored future attempt;
    substitute an inferred binding date.
  - 5–11: omit yesterday's definitions; skip empty legacy progress; accept a failed legacy
    commit; ignore midnight during loading; scan a clamped substitute; trust a response
    for the wrong requested date; rescan a committed legacy check.
  - 12–19: treat failed history as empty; reconcile only fetched attempts; omit durable
    recovery evidence; accept expired evidence despite blocked cleanup; ignore bound hash
    or date (separate probes); restore missing or mismatched stamps (separate probes).
  - 20–29: enumerate every tick; miss a changed device date; lose a pending clock flag;
    lose its immediate model state; overlap per-puzzle transactions; publish a disposed
    result; allow late initialization after disposal; leak timer or listeners (separate
    probes); forget the selected backend on lifecycle restart.
  - 30–41: discard a failed progress generation; restamp a retry; let an older successful
    generation erase a newer failure; write unchanged enabled sessions; write persistent
    progress in memory mode; retire pending progress early; never retire after success;
    omit the start stamp; route enabled progress through the casual dropped-write path;
    select from mutable completion; omit provider start or disposal (separate probes).
  - 42–51: ignore working IndexedDB; omit the fallback capability probe; retain a successful
    probe key; overwrite a colliding probe key; accept mismatched readback; switch a selected
    persistent backend to memory on reopen failure; broadcast memory writes; share memory
    attempts across instances; rescan memory legacy; ignore memory key binding.
  - 52–58: make start stamp, solve evidence or opening mode unobservable (three separate
    probes); open a cross-tab channel in memory; omit local focus sampling; prevent a
    failed new binding from retrying; mistake unavailable UUID support for blocked storage.
  - 59–64: skip persistent progress cleanup; delete progress in memory mode; omit delayed
    new-day selection; select before bindings reconcile; override navigation after delayed
    results; lose casual archive completion after a given-up challenge.
  First sweep stopped after 35 caught probes: probe 36 used an invalid empty `if` body,
  so compilation failed and zero tests ran. Corrected that scratch mutation to a valid
  no-op; this was not counted as a caught probe or an escaped feature assertion. Subsequent
  complete sweeps caught 55 of 55, then 58 of 58 as read-through regressions were added.
  After the retention/selection changes, the complete final sweep caught all 64. No weak
  assertion or escaped valid probe remains. Scratch reports/scripts are outside the repo.
- Commit-3 gate preflight declined at 106 TIME_WAIT sockets, before deleting any cache or
  running any of the five steps. Subsequent counts were 130 and 145; waited for fewer
  than 100 before beginning the cold gate. This is separate from the actual gate runs.
- First commit-3 cold run began at 34 TIME_WAIT sockets: TypeScript 0, lint 0 (no
  warnings), unit 0 (62 files, 1406 passed; stderr exactly 0 bytes), build 0, browser 0
  (651 passed, 1 existing conditional skip). Build stderr was 1512 bytes of stale
  baseline-browser-mapping warnings. Browser stderr was 5581 bytes: NO_COLOR/FORCE_COLOR
  warnings and one bootstrap ERR_NO_BUFFER_SPACE report, recovered by the existing
  startup retry. There was no failed test or nonzero gate step, but this run was not
  accepted for committing: applied AGENTS.md's socket-error rule and reran the entire
  cold gate after waiting for the socket pool. No source/test changes followed this run.
- Complete commit-3 cold rerun began at 33 TIME_WAIT sockets: TypeScript 0, lint 0
  (no warnings), unit 0 (62 files, **1406 passed**; stderr exactly **0 bytes**), build 0,
  browser 0 (**651 passed, 1 existing conditional skip**). Build stderr was 1512 bytes
  of stale baseline-browser-mapping warnings; browser stderr was 5246 bytes of
  NO_COLOR/FORCE_COLOR warnings, with no socket-exhaustion report. Diff check passed;
  only the nine intended code/test/document paths changed, with no asset changes.
  This rerun is the accepted gate for commit 3; both runs and preliminary failures are
  recorded above. The separate decision-document commit `d08736e` was pushed first;
  independently verified its CI passed (run `38015562525`). Commit 4 waits for review.

**As built: implementation commit 4, session hooks (2026-10-10)**
- Explicit daily session methods expose Start and asynchronous Hint/Check requests; no
  selector, refetch, completion flag or navigation synthesizes a Start. Direct placement,
  removal, Reset, Undo, pointer and keyboard calls share the binding's action guard. Direct
  synchronous Hint/Check return no answer for an active first attempt; casual/unbound and
  post-result answers retain synchronous behaviour. The real controls use the request path,
  which still answers synchronously in default roots. No public activation or new UI is added.
- Start freezes the target binding while its attempt commits. It samples the press instant,
  rechecks the live outcome date, and prepares stamped progress before releasing the cover
  or action guard, in one synchronous action. Failed/aborted starts keep old progress.
  New starts clear the board, completion, history and evidence unless freshly read matching
  progress belongs to that attempt. Duplicate starts preserve locally edited state/history;
  untouched duplicates resume matching other-tab moves. Newly arrived matching solve evidence
  is reconciled before reveal, without inventing a timed finish or celebrating hydration.
- Empty progress failure does not undo a saved Start. Its retry retains the original
  generation/time; while untouched it adopts validated matching external progress instead
  of overwriting it. After a local mutation, ordinary same-puzzle last-write-wins applies.
  Own failed snapshots take precedence during same-root hydration; reloads cannot see that
  in-memory cache and still require durable matching stamps/evidence.
- Assistance freezes that board until its transaction completes, merges current stored
  flags, and publishes only for a matching, still-active attempt in the live window.
  Already-assisted unchanged success is sufficient. A fixed concurrent result, failed save,
  disposal or obsolete navigation produces no new answer. Level/difficulty navigation uses
  a version as well as session identity, so going away and back cannot revive an answer.
- Each successful placement calls the hook inside its existing action. A first solve
  captures the wall instant/local date, freezes further edits immediately and saves its
  canonical targets/evidence with the winning board before the surrounding action can
  run reactions. Completion feedback remains independent of storage latency. Reset,
  removal and Undo also call the mutation hook, but cannot manufacture a first finish.
- Pending finishes keep their captured instant/date across failures, navigation and
  reconciliation. A root that still owns that capture can retry a timed finish; a new root
  with only durable evidence recovers a lost finish without time. Older durable other-tab
  evidence is recovered first. Latest stored assistance and sticky clock flags are merged;
  fixed results dominate. Timer, focus/visible reconciliation, explicit retry and later
  board saves retry pending finishes, with one finish request in flight per binding and
  the existing per-puzzle transaction queue. Retain unserved failed finishes until resolved.
  Successful attempt completion can unlock input even if progress saving still fails.
- Successful post-result changes inside the window start Practice from their resulting
  board; refused placement, empty Undo/Reset and advice do not start it. Solves freeze only
  that run; a later successful change begins another run. Reset/Play again remains undoable.
  Removing a completed piece recomputes its enabled completion so Practice remains editable.
  Practice and archive changes clear first-attempt evidence, preserving the first result
  and start stamp. Shared clock sampling clears Practice when its date leaves the window.
  Same-root remount may discard its Practice clock, while retaining memory-mode results
  and progress. A fresh memory root has no retained result.
- Older archive boards can persist while challenge initialization is retryable. If opening
  has not selected a backend yet, retain the changed snapshot without writing; flush it only
  after selection, in memory when appropriate. A not-yet-hydrated binding may save only actual
  local casual edits, never a metadata change caused by adopting an old attempt. This guards
  existing progress against an empty initialization write. Disabled-root retries stay unchanged.
- Reformatted the coordinator for Claude's nit: no lines over 110 characters and no
  semicolon-separated statements. This does not activate the challenge. The corpus-clamp
  exception is a separately recorded correction awaiting review, before activation;
  D16 remains a low-priority requirements document with no release implementation.
- Deliberate tests: new `challengeSession.test.ts` covers these session/save boundaries,
  six shared placement paths, real Hint/Check controls, observable availability and Practice,
  failed saves, cross-tab records, raw-date changes, reload and memory-only play. Two existing
  lifecycle retry tests now Start before placing; the retirement test waits for the new
  first-finish save so it continues isolating progress retirement. Existing casual
  advice/Undo/Reset assertions are unchanged. The existing given-up/archive regression
  retains its assertion and caught the premature unhydrated write described above.
- Preliminary targeted checks: first run **143/145 passed, 2 failed**, the two lifecycle
  cases that placed without a Start. Corrected their preconditions as above, not the guards;
  the second run passed 145/145, then 148/148 with added regressions. An intermediate run
  passed **153/154, 1 failed**: the unchanged given-up/archive check caught a real premature
  metadata write before hydration. Required actual local edits for that early casual path;
  rerun passed 154/154. Subsequent strengthened checks passed 284/284, 296/296 and 298/298.
  Final pre-mutation targeted validation passed **300/300** across six suites: new sessions
  97, lifecycle 48, existing advice 13, Undoable Reset 14, progress parser 87 and attempt
  store 41. Added **97 tests** over commit 3. Initial targeted lint reported one unused
  import; an intermediate type-check caught an untyped zero-argument mock's indexed call
  tuple. Corrected both; subsequent targeted lint/type-check passed. Mutation/gate results
  are recorded after their actual completion below.
- The separate product/review document was committed and pushed first as `f622f72`;
  independently checked CI run `38052892359`: success on that exact head. Future-board
  inspection is data/code evidence; no hard early-access protection is claimed.

- Mutation validation: final sweep **93/93 caught at their intended assertion**. Each
  probe runs only its named regression and restores the source before the next; the
  runner verified all four runtime files were restored byte for byte. The first sweep
  stopped at probe 22: **21/22 caught**, one passed because replacing matching progress
  with null triggered the existing empty-write retry, which adopted that same matching
  progress before any write. Revised that probe to replace matching moves with a stamped
  empty board, actually discarding them; the unchanged cross-tab test caught it. No runtime
  correction or weakened assertion was needed for that recovered mutation. Restarted
  the whole sweep, yielding the final tally above. Probes 46–51 remove the shared capture
  hook separately against each reachable placement path.

  Deliberate probes, one at a time:
  1. direct placement before Start.
  2. direct removal during pending finish.
  3. Reset during pending finish.
  4. Undo during pending finish.
  5. pointer press before initialization.
  6. pointer release during assistance.
  7. keyboard during pending finish.
  8. direct Hint skips its saved flag.
  9. direct Check skips its saved flag.
  10. Hint button uses unsafe synchronous call.
  11. Check button uses unsafe synchronous call.
  12. unbound casual placement blocked.
  13. casual request made asynchronous.
  14. Start timestamps transaction instead of press.
  15. adopted attempt uncovers before empty progress.
  16. input opens between adoption and board reset.
  17. Start state loses observability.
  18. accept aborted Start with a valid read record.
  19. new Start keeps old casual pieces.
  20. running duplicate Start clears locally edited progress.
  21. untouched duplicate ignores matching cross-tab progress.
  22. new concurrent Start discards matching moves.
  23. Start progress omits attempt association.
  24. restore old-version unstamped write.
  25. untouched empty retry overwrites matching moves.
  26. empty retry accepts wrong attempt stamp.
  27. matching external moves replace locally edited progress.
  28. local mutation is never recorded as an edit.
  29. Start omits outcome-date reconciliation.
  30. Start omits newly arrived solve recovery.
  31. future existing attempt allows Start.
  32. future attempt permits board edits.
  33. legacy boards can Start.
  34. stale committed Start clears old board.
  35. publish assistance before transaction completes.
  36. assistance does not save its flag.
  37. failed assistance write is accepted.
  38. already-assisted unchanged success is refused.
  39. late already-assisted answer ignores fixed result.
  40. assistance loses observable input freeze.
  41. navigation return allows obsolete answer.
  42. level navigation is not recorded.
  43. difficulty navigation is not recorded.
  44. disposed assisted outcome publishes advice.
  45. late advice ignores outcome date.
  46. winning capture omitted: direct.
  47. winning capture omitted: tap.
  48. winning capture omitted: drag.
  49. winning capture omitted: keyboard.
  50. winning capture omitted: pick-tap.
  51. winning capture omitted: pick-keyboard.
  52. winning evidence relies on reactions.
  53. producer swaps target axes.
  54. finish uses callback wall instant.
  55. finish uses callback calendar date.
  56. own pending finish is wrongly recovered as lost.
  57. ignore older durable solve before finish.
  58. unserved pending finish has no owner.
  59. clear pending finish even after save fails.
  60. fixed result leaves input locked by pending finish.
  61. pending finish loses observability.
  62. a failed unserved finish retires early.
  63. finished result waits for progress save too.
  64. finish retries queue duplicate operations.
  65. timer does not retry a failed finish.
  66. later board saves do not retry pending finishes.
  67. pending clock flag omitted from finish.
  68. finish overwrites latest stored assistance with local flags.
  69. finish removes a competing fixed result.
  70. completion flag manufactures a first finish.
  71. restoration manufactures a first finish.
  72. celebration waits for finish persistence.
  73. result adoption celebrates a second time.
  74. Practice forgets the first result.
  75. Practice emits first-attempt solve evidence.
  76. refused placement starts Practice.
  77. empty Undo starts Practice.
  78. empty Reset starts Practice.
  79. Practice solve loses its frozen time.
  80. next Practice run uses previous run start.
  81. Practice begins without clearing live evidence.
  82. completed removal stays inert in Practice.
  83. Practice clock not presented.
  84. Practice is not observable before its first run.
  85. expired Practice remains active.
  86. archive edit keeps first-solve evidence.
  87. legacy assistance is routed through challenge save.
  88. old archive cannot save during initialization failure.
  89. writes progress before opening mode is selected.
  90. opening does not flush queued casual memory progress.
  91. hydration loses own failed snapshot.
  92. attempt adoption overwrites unhydrated casual board.
  93. memory mode writes persistent progress.

- Commit-4 cold gate, first run (2026-10-10): TIME_WAIT **57**, independently verified
  repository root and all four cache targets before deletion. TypeScript **0**, lint **0**
  (no warnings), unit **0** (**1503 tests in 63 files**, stderr exactly **0 bytes**),
  build **0**, browser **0** (**651 passed, 1 existing conditional keyboard skip** at
  `keyboard.spec.ts:184`, page not scrollable). No failed cold gate run for this commit;
  the earlier targeted failures and recovered/revised mutation are recorded above.
  Build stderr **1512 bytes** of baseline-browser-mapping warnings; browser stderr
  **5247 bytes** of NO_COLOR/FORCE_COLOR warnings. Inspected browser stdout/stderr:
  no ERR_NO_BUFFER_SPACE. Final diff/changed-file checks passed: only the seven intended
  source/test/document paths; no committed assets or visual baselines changed.
  New head is for Claude's review; commit 5 and the separate clamp correction await review.

**As built: commit-4 review correction (2026-10-10)**
- Removed the celebration eligibility call and its now-unused coordinator helper. Normal
  completion detection still runs independently of finish-save latency. Enabled progress
  hydration already normalizes a winning board's completion flag inside its action; no
  reachable gameplay path needed the extra guard. This conclusion is from reading the
  restoration/placement paths and the new reachable reload regression, not an impossible
  unstarted solved-state probe.
- Removed only the navigation counter increment in `setDay`. Retired daily sessions are
  dropped from the active map, so returning to a date gets a new session. Kept the
  selected-session check and level/difficulty counters, which protect same-session
  away-and-back answers. An unserved binding's guard also remains in place.
- Added two tests in `challengeSession.test.ts`: reload a correctly stamped winning board
  with a false saved completion flag and explicitly select it; verify normalized completion,
  no second celebration, and unchanged first result. Also hold a real already-committed
  Hint outcome, navigate A→B→A, verify replacement session identity, then release and
  verify no old/new-session advice is published. Existing assertions are unchanged.
- Measured targeted check: **154/154 passed**, three suites (sessions **99**, lifecycle
  **48**, provider **7**), unit stderr **0 bytes**. Added **2 tests** over `8b1e435`.
  No failed targeted run for this correction. Mutation sweep **2/2 caught at the intended
  assertion**, source restored byte for byte: omit restored winning-board completion
  normalization → the no-second-celebration assertion; keep unserved daily sessions →
  the replacement-session assertion. These test the assurances that make the removed
  additions redundant, rather than pretending reintroducing redundancy changes behavior.
- Claude's independently reported **7/9** and two uncaught additions are preserved in
  the review notes; no claim is made that Codex reran those nine probes. The separate
  narrowed decision/contract is already committed as `38d6a1b`; no clamp behavior, fixture,
  visual asset or public activation is included in this correction. Full gate results
  follow after their actual completion.

**Validation and review record**
- Review-correction cold gate, first run (2026-10-10): TIME_WAIT **52**; verified the
  repository root and four cache paths before deletion. TypeScript **0**, lint **0**
  (no warnings), unit **0** (**1505 tests in 63 files**, stderr **0 bytes**), build **0**,
  browser **0** (**651 passed**, one existing conditional keyboard skip at
  `keyboard.spec.ts:184`). No failed gate run for this correction. Build stderr
  **1512 bytes** of baseline-browser-mapping warnings; browser stderr **5081 bytes** of
  NO_COLOR/FORCE_COLOR warnings. No ERR_NO_BUFFER_SPACE in browser stdout or stderr.
  Final diff/scope checks passed: four intended document/source/test paths, no committed
  assets or baselines changed. Send this correction head and the narrowed clamp contract
  to Claude for review; no clamp implementation, fixture, PR or merge yet.

- Commit-4 review / narrowed clamp decision document gate (2026-10-10), first cold run:
  TIME_WAIT **51**; verified root and all four cache targets before deletion. TypeScript
  **0**, lint **0** (no warnings), unit **0** (**1503 tests in 63 files**, stderr **0 bytes**),
  build **0**, browser **0** (**651 passed**, one existing conditional keyboard skip).
  No failed gate run. Build stderr **1512 bytes** of baseline-browser-mapping warnings;
  browser stderr **5245 bytes** of NO_COLOR/FORCE_COLOR warnings; stdout and stderr contain
  no ERR_NO_BUFFER_SPACE. Only NEXT-STEPS differs; runtime correction was saved separately
  and restored to the reviewed head before this document gate. This commit records the
  user's narrower choice and the review-correction contract; no clamp runtime claim is made.

- Commit-3 review/decision documentation gate (2026-10-10), first cold run: socket
  count 36; TypeScript 0, lint 0 (no warnings), unit 0 (62 files, 1406 tests passed;
  stderr exactly 0 bytes), build 0, browser 0 (651 passed, 1 existing conditional skip).
  No failed gate run. Build stderr was 1512 bytes of stale baseline-browser-mapping
  warnings; browser stderr was 5245 bytes of NO_COLOR/FORCE_COLOR warnings, with no
  socket-exhaustion report. Only NEXT-STEPS changed; diff check passed. This separately
  records acceptance, the clamp choice and D16's future requirements, not code for them;
  no runtime mutation claim is made for this documentation-only commit.
- No-storage decision document gate (2026-10-10), first cold run: socket count 37;
  TypeScript 0, lint 0, unit 0 (60 files, 1340 tests; stderr 0 bytes), build 0,
  browser 0 (651 passed, 1 existing conditional skip). No failed gate run. Build stderr
  was 1512 bytes of stale baseline-browser-mapping warnings; browser stderr was 5245
  bytes of NO_COLOR/FORCE_COLOR warnings. Only this document changed; diff check passed.
  This records the user's decision and the planned mechanism/tests, not runtime proof.
  No runtime mutations are claimed for this documentation-only clarification.
- Draft evidence: code read and checkout measured; no claims yet about the proposed wiring.
- Draft gate (2026-10-10), first cold run: socket count 67; TypeScript 0, lint 0,
  unit 0 (60 files, 1266 tests passed; stderr exactly 0 bytes), build 0, browser 0
  (651 passed, 1 existing conditional skip: `keyboard.spec.ts:184`, page not scrollable).
  No failed gate run. Build stderr emitted
  stale `baseline-browser-mapping` data warnings; browser stderr emitted `NO_COLOR` versus
  `FORCE_COLOR` warnings. Lint had no warnings. Only `NEXT-STEPS.md` changed, and
  `git diff --check` passed. Base-commit CI
  also passed at `11b87a1` (run `38000679011`). This gates the draft documentation, not the
  future implementation; no runtime mutation probes have been run for an unbuilt feature.
- Before every commit: the complete cold gate in `AGENTS.md`, separate exit codes, zero
  unit stderr, socket count below 100 first; all failures recorded alongside reruns.
- Before the implementation commit: add As built notes here with concrete mechanisms,
  deliberate test changes, exact counts, every mutation and any review correction.
- CI on the first draft `aa732fc` passed (run `38003589789`), independently checked after
  Claude's review arrived. This is the earlier draft's CI, not this revision's gate.
- Revised-contract gate (2026-10-10), first cold run: socket count 54; TypeScript 0,
  lint 0 (no warnings), unit 0 (60 files, 1266 tests passed; stderr exactly 0 bytes),
  build 0 and browser 0 (651 passed, 1 existing conditional skip at `keyboard.spec.ts:184`).
  No failed gate run. Build stderr: 1512 bytes, stale `baseline-browser-mapping` warnings;
  browser stderr: 5244 bytes, `NO_COLOR` versus `FORCE_COLOR` warnings. Only
  `NEXT-STEPS.md` changed; `git diff --check` passed. This gates the revised documentation;
  no implementation or runtime mutation probes are claimed.
- Claude's first review: corrections recorded above; revised plan accepted on `4376e7d`.
  Start-over-progress decision: approved by the user (2026-10-10), recorded in the decision
  log, D3 and item 5. The implementation and checks for commits 1 and 2 are recorded above; later commits
  await the preceding head's review as agreed.

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
