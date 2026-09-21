# Domino Fill — Improvement Spec (FINAL)

Status: **rev 2.2 — implementation-ready.** Finalised after three independent reviews (game design,
correctness/architecture, web platform) plus two implementation-readiness passes. Every empirical
claim has been verified against a real build on this machine (Node v25.4.0, Next 16.0.10); content
sizes in P1-6 and the cell-size arithmetic in §5 are measured, not estimated.
Scope: `app/` of the Next.js 16 / React 19 / MobX 6 / Tailwind v4 app in this repo
Reference feel: DominoFit — instant, tactile, forgiving, mobile-first

**The rules of this game, stated correctly** (the tutorial currently states them wrong — see D9):
a vertical domino writes **1** to its *upper* cell and **0** to its lower; a horizontal domino
writes **0** to its *left* cell and **2** to its right. Each edge number is the **sum of pips**
landing in that row/column — *not* a count of pieces. Every non-rock cell must be covered.

---

## 0. Corrections to the draft (read this first)

Several earlier analyses were wrong. They are recorded rather than deleted because each is
superficially plausible and will otherwise be re-derived by the next reader.

| Draft claim | Verdict | Evidence |
|---|---|---|
| Zoom breaks the hit-test because cell size is "computed in two places" | **Wrong.** The hit-test is internally consistent at every zoom level. | `BoardSquare.tsx:31` lays cells out at exactly the integer `squareSize` the hit-test divides by, and `repeat(n, 0fr)` content-sizes the tracks to it. `clientX` and `getBoundingClientRect()` are both layout-viewport CSS px, so their difference is correct under page zoom *and* pinch zoom. |
| Mutating the board leaks across server requests | **Wrong.** | `getCurrentActiveBoard` is a Server Action called from a client `useEffect` (`DominoClient.tsx:16`), so its result is serialised across the RPC boundary. The client mutates its own copy. The imported JSON is never mutated. |
| Sums can match while cells are still empty ("premature win") | **Provably impossible.** | Proof in D6. Confirmed empirically: exhaustive enumeration over 4×4 and 5×5 with 85 rock layouts found zero false wins, and all 18 shipped boards have exactly one full solution and no partial sum-match. |

Two further claims made during review were also checked and rejected:

| Review claim | Verdict | Evidence |
|---|---|---|
| `z-999` is not a valid Tailwind v4 class, so the tutorial overlay gets no stacking context | **Wrong.** | The build emits `.z-999,.z-\[999\]{z-index:999}`. Tailwind v4 accepts bare numeric z-index. The overlay's real bug is `absolute` vs `fixed` (D9). |
| Fixing the `LevelStore` guard won't unblock the build, because `useLocalhost` also breaks SSR | **Wrong today, right soon.** | Verified: the one-line guard fix alone makes `next build` prerender all 5 routes. `useLocalhost` never runs server-side because `DominoClient.tsx:30` short-circuits while loading — but D10-c will change that, so fix both together (D1). |

The real defects are **layout**, not geometry; a **module-singleton store**, not JSON aliasing;
and a **click-stealing overlay**, not coordinate drift.

---

## 1. Confirmed defects

### D1. The production build fails on `master` — BLOCKER

```
$ npx next build
✓ Compiled successfully
Error occurred prerendering page "/_not-found"     ← page name varies; see below
TypeError: localStorage.getItem is not a function
```

The failure is at **module evaluation**, which every route triggers, and prerendering runs across
15 workers — so the page named in the error is nondeterministic (observed as both `/_not-found`
and `/dominoFill` on different runs). Don't treat the page name as diagnostic.

`app/stores/BoardsStore.ts:28`:

```ts
if (typeof localStorage !== 'undefined') {
    this.hasSeenTutorial = localStorage.getItem('hasSeenTutorial') === 'true'
}
```

Node ≥ 22 (here v25.4.0) exposes a global `localStorage` object that is inert without
`--localstorage-file`, so the `typeof` guard is **true** on the server while `getItem` is
`undefined`. It runs at *module evaluation* because `RootStore.ts:14` constructs the store graph
at module scope, and `StoreWrapper` wraps `<html>` (`layout.tsx:28`), pulling that graph into
every route's SSR bundle — which is why even a route with no game on it can be the one to break.

The guard must be `typeof window !== 'undefined'` (as `SizeStore.ts:11` already does correctly).
Note the field is also **dead**: its only consumer is commented out at `BoardsStore.ts:95-97`;
`Tutorial.tsx:13` uses `useLocalhost` instead. A build-breaking line feeding a field nothing reads.

**Verified:** that one-line change alone makes `npx next build` succeed, prerendering all 5 routes.
The second `localStorage` access — `useLocalhost.ts:4`, which reads during *render* (D10-k) — does
**not** fire today, because `DominoClient.tsx:30` returns `no board` while `isLoading`, so
`Tutorial` never renders on the server. It is a live landmine rather than a current failure: **the
moment D10-c (SSR the board as a prop) lands, `Tutorial` will render server-side and re-break the
build.** Fix both in the same pass — not because the build needs it today, but because the very
next P2 item detonates it.

### D2. The store graph is a module singleton shared across SSR requests

`RootStore.ts:14` runs `new RootStore()` at module scope. `"use client"` marks a *boundary*; the
module is still evaluated during SSR. One `LevelStore` — with a never-disposed `autorun` and
`reaction` (`BoardsStore.ts:32,45`) — exists per server process and is shared by every request.

Inert today only because `setBoards` never runs server-side. It is the direct cause of D1, and it
is what would turn P1-3's persistence and P0-3's store Map into a genuine cross-user leak.

### D3. The board's number gutters break below ~60px cells — this is the "zoom breaks it" bug

`ClientBoard.tsx:58` sets the wrapper to `width: boardSize`, but the row actually laid out
(`:60-75`) is `VerticalNumbers + border-4 + grid(n·cell) + border-4 + VerticalNumbers`
= `(n+2)·cell + 8px`, while `squareSize = boardSize/(n+2)`. **It is 8px too wide for its parent at
every size.** Being a flex row, the gutters absorb it, so row labels sit a few px off their rows —
always, even at 100% zoom.

Then `text-6xl` (60px) in `VerticalNumbers.tsx:10` / `HorizontalNumbers.tsx:9` turns that into
collapse. A flex item's default `min-width`/`min-height` is `auto` = min-content, so **a 60px glyph
imposes a 60px floor on a box declared `height: ${cell}px`**. Alignment therefore holds only while
`cell ≥ 60px`:

| viewport | board | cell | row overflow | gutter height vs board |
|---|---|---|---|---|
| 1280 desktop | 8×8 | 77px | 10px | 616 vs 616 — aligned |
| 1280 @ 200% zoom | 8×8 | 58px | 12px | **480 vs 464 — drifts** |
| 360 phone | 8×8 | 32px | 4px | **480 vs 256 — collapses** |

`cell = min(0.9·innerWidth, 768)/(n+2) < 60` whenever `innerWidth < 667px` — i.e. browser zoom
beyond ~190% on a 1280 screen, or **any phone**.

> **Measured in a real browser (P1-9 harness), which revises this.** At 360×640 the gutter
> boxes render at the declared cell height (39px), *not* floored at 60px: `min-height: auto`
> only prevents a flex item shrinking below its content, and nothing is applying shrink
> pressure here — the column has auto height, so it grows instead. Label-to-row drift is a
> **constant 4px** (the grid's left `border-4`), not progressive. After the shell-width fix
> (P0-9a follow-up) there is also **no horizontal page overflow** at 360 or at 1280.
>
> So what remains for P0-3 is narrower than this section assumed: a **60px glyph rendered
> inside a 39px box**, which overflows its cell visually and collides with its neighbours,
> plus that constant 4px offset. Fix the font scaling and the border accounting; do not go
> looking for accumulating drift.

Two compounding factors: `boardSize` consults **width only**, so a landscape phone (800×400)
produces a 648px-tall board inside a `min-h-screen … justify-center` flex container
(`DominoClient.tsx:32`) and the overflow above a centred flex item **cannot be scrolled to**; and
`innerWidth` includes the scrollbar, which the nested `min-h-screen` (D10) guarantees exists.

Also: `ClientBoard` renders `VerticalNumbers` **twice** (`:61` and `:74`) but `HorizontalNumbers`
only once (`:59`), while `squareSize` reserves two gutters in *both* dimensions. The duplicate
right-hand gutter costs a full column of width on the one device that has none to spare.

### D4. Piece overlays steal clicks from the cell above them

`DominoPieceOne.tsx:9` renders `height = size*2 + 16` with `className="-translate-y-4"`, and its
outer `<rect fill="transparent" stroke="black">` (`:12`) is at `y=4`. Net: the rect's top edge sits
**12px above its own cell**. `fill="transparent"` is `rgba(0,0,0,0)` — a paint value, *not* `none` —
so under the default `pointer-events: visiblePainted` it **does** hit-test. `Pieces.tsx:31`'s layer
has no `pointer-events: none` (unlike `Hover.tsx:17`, which has it), and the handler at `:22-28`
calls `removePiece()` then `stopPropagation()`.

**Clicking the bottom 12px of an empty cell directly above a placed domino deletes that domino
instead of placing a piece.** Same geometry in `DominoPieceTwo.tsx:11,14`. Reproducible with a
mouse at 100% zoom — this is the click-lands-in-the-wrong-place complaint that the draft
misattributed to zoom.

### D5. `CurrentBoardStore` is reconstructed on every invalidation

`BoardsStore.ts:105` returns `new CurrentBoardStore(...)` from a computed. (Precisely: it is a
memoised computed, so this happens on every *invalidation* — `difficulty`, `level`, `setBoards` —
not literally every read. The draft overstated this; the defect is real regardless.)

`makeAutoObservable` runs inside a derivation, identity is unstable across every level change,
`boardWidth` is silently reset, and any future per-board state (timer, undo stack) would be
discarded. Board state survives only because the underlying `board` array is shared by reference.

### D6. The win check is implemented twice, and only the hidden copy is live

`CurrentBoardStore.completed` (`:161`) is read only for the `pointerEvents: 'none'` gate
(`ClientBoard.tsx:55`) and the tutorial button (`Tutorial.tsx:39`). The **live** win path is a
hand-inlined duplicate at `BoardsStore.ts:34-35` that re-derives the same comparison and is what
actually calls `setCompleted(true)` and plays the sound. Any fix applied to `completed` alone is a
no-op on the live path.

**On the board-full check.** It is not needed for correctness — matching the column sums alone
already *implies* a full board. Let α_j = #1s and β_j = #2s in column j, f_j = non-rock cells,
e_j = empty, C_j the target. Coverage gives `f_j = 2α_j + β_j + β_{j+1} + e_j`; sums give
`C_j = α_j + 2β_j`; and `β_0 = β_n = 0`. Eliminating α_j and writing `d_j = β_j − β*_j` against the
true solution:

> `d_0 = 0`,  `d_{j+1} = 3·d_j − e_j`,  `d_n = 0`  ⟹  `Σ 3^{n−1−k}·e_k = 0`  ⟹  **e_k = 0 ∀k**

The invariant this rests on is that every `1` has a `0` below it and every `2` a `0` to its left.
**The one thing that can break it is a corrupted `removePiece` leaving an orphan half (D7)** —
which is why D7 is load-bearing and the board-full assertion is worth keeping as cheap insurance.

### D7. `removePiece` is unguarded

`CurrentBoardStore.ts:149`. Reachable today only for values `1` and `2`, where it is correct. But:
the `else` branch would write `board[i][-1]` when `j === 0`, and the `if (value == 1)` branch writes
`board[i+1][j]` with no bound check. It is one careless change from breaking the D6 invariant.

### D8. Hover state is global, per-board, and never cleared

`hoverCords` lives on the global `SizeStore` (`:8`) but is consumed by a per-board getter
(`CurrentBoardStore.ts:60`). `Tutorial.tsx:12` builds a second `CurrentBoardStore` on the same root,
so moving the pointer over the 2×2 tutorial board drives a phantom highlight on the 6×6 board
behind it. There is no `onMouseLeave`/`onPointerLeave` anywhere, so the highlight sticks at the
last position when the pointer exits.

### D9. The tutorial states the wrong rule, and is a hard gate

`Tutorial.tsx:34`: *"The numbers on the edges of the board indicate how many domino pieces should
be placed in that row or column."* That is not the rule (see header). A player following it will be
wrong on their first board and will not know why.

Compounding: the modal has **no skip, no close, no escape** (`:39` disables the only button until
the 2×2 board is solved); the 2×2 gate tests the asymmetric pip rule the text never taught; it
teaches neither removal nor rocks, and the very next screen has eight of them; `absolute w-full
h-full` with no positioned ancestor resolves against the initial containing block rather than the
scrolled viewport, so it fails to cover an overflowing page (**not** a "two-viewport page" — that
diagnosis is false; see D10-b); and the board falls through `squareSize`'s
`default: 96`, making it 384px + gutters inside a 324px modal on a phone.
**If any of that prevents solving the 2×2, the game cannot be played at all.**

*Correction:* an earlier draft claimed `z-999` is not a valid Tailwind v4 class and that the
overlay therefore gets no stacking context. **That is false** — the build emits
`.z-999,.z-\[999\]{z-index:999}`; Tailwind v4 accepts bare numeric z-index values. The overlay does
get a stacking context and does sit above the board. Switch it to `fixed inset-0` for the
positioning bug, but do not expect a spelling change to fix anything.

### D10. Miscellaneous confirmed defects

| # | Location | Defect |
|---|---|---|
| a | `app/page.tsx:4`, `app/dominoFill/page.tsx:4` | Both `JSON.stringify` an **un-awaited Promise** — the build log prints `boards {}`. Dead server work producing nothing, plus a `console.log`. |
| b | `page.tsx:8` + `DominoClient.tsx:32` | **❌ Diagnosis false; cleanup done in P0-3.** The claim was that nesting `min-h-screen` made the page two viewports tall and guaranteed a scrollbar. It does not: `min-height: 100vh` on a child of a `min-height: 100vh` parent resolves against the *viewport*, not the parent, so both are one viewport. Measured in Chromium at 1280×800: outer 800px, inner 800px, not 1600. The 1095px document that prompted this was ordinary content overflow. The redundant wrapper was removed anyway as cleanup, and `vh` became `svh` for the mobile URL bar — but nothing about the duplication was a defect. |
| c | `DominoClient.tsx:16` | The board is fetched by a Server Action from a `useEffect`, so first paint costs an RPC round-trip for a static JSON import, and the game SSRs **nothing** (`:30` renders `no board`). Pass it as a prop from the server component. |
| d | `Boards.ts:1` + `:54` | A `"use server"` module may only export async functions, yet it `export default`s a class — dragging the whole generator into a server-action bundle. |
| d2 | ~~`CurrentBoardStore.ts:19,34`~~ | **✅ Fixed in P0-6.** `correctHorizontalValues` summed a **column** and `correctVerticalValues` a **row**. Now `currentColumnSums`/`currentRowSums`, with `definition.columnTargets`/`rowTargets`. The inverted names survive only in `StoredPuzzle` and the JSON file, for data compatibility, and are mapped in `definitionFrom`. |
| e | `BoardsStore.ts:34` | `audio?.play()` has no `.catch` → unhandled rejection whenever autoplay policy blocks it. `public/win.mp3` exists and is unused; the file that plays is `winSilent.mp3`. |
| f | ~~`BoardSquare.tsx:42`~~ | **✅ Fixed in P1-5.** `snap.mp3` played on **every** square click, including rejected placements, so the sound meaning "that worked" also meant "that did not". It also allocated a new `Audio` per click. Sound now follows the *outcome*, from `feedback.ts`, with one reused element per sound; the square's click handler is gone. |
| g | ~~`VerticalNumbers.tsx:13-18`, `HorizontalNumbers.tsx:12-17`~~ | **✅ Fixed in P1-5.** All three parts: state now carries a shape as well as a colour (strikethrough / ring), `satisfied` requires the line to be *full* and not merely summed, and the palette is measured at ≥4.5:1. The contrast was worse than stated here — neutral `#ababab` measured 1.86:1 and the green `#4bce4b` **1.66:1**, i.e. the state colour was the least legible thing on screen. |
| h | ~~`ClientBoard.tsx:57`~~ | **✅ Fixed in P1-3.** A completed board sets `pointerEvents: 'none'` and the completion reaction only ever sets `completed` *true*, so with no restart affordance a completed board was a permanent soft-lock. Reset clears the flag, `undo` recomputes it from the rules, and both controls sit outside the board so neither is disabled by it. |
| i | ~~`BoardsStore.ts:45`~~ | **✅ Fully fixed: restart in P1-3, the remainder in P1-7.** `GameControls` renders Undo and Reset, so a mis-solve no longer needs a page reload. The original wording also faulted the difficulty reaction for "never resetting board state" — that is **no longer a defect but a requirement**: P0-5 makes sessions stable per `puzzleId` precisely so switching difficulty or level and coming back returns the same board with the same moves, and `tests/sessions.test.ts` enforces it. The narrower remainder — initial selection landing on the first *unsolved* puzzle — is done in P1-7, which is where the persisted completion state it needs comes from. It re-selects only when the served puzzle actually changed, so a same-day refetch never moves a player mid-board. |
| j | ~~`dominoBoard.ts:137,147`~~ | **✅ Fixed in P1-6 (row 18, stage 1).** The generator's output format no longer matched the parser. It builds `boardCode` by bare concatenation and slices it per character, but the runtime compares against a **comma-joined** string (commit `7ef3094`). Single-char slicing also silently corrupts any sum ≥ 10 — and shipped boards contain `10`, `11`, `13`. Any board `DominoBoard` produces today is uncompletable. `allow0Lines`' `code.includes('0')` test was broken for the same reason — it is true of a line summing to **10** and says nothing about a line summing to zero. The generator now lives in `scripts/generate-boards.ts`, emits comma-joined targets, and compares line sums as numbers; a round-trip test parses its output with `definitionFrom` and asks `isBoardFull`/`targetsMatch` whether the runtime accepts the solution. Two further defects surfaced while moving it: `testRockValidity`'s result was computed and never read, and its "claimed by two cornered neighbours" test used `== 2`, so a cell claimed by three or four was waved through. |
| k0 | `Tutorial.tsx:27` | `absolute w-full h-full` with no positioned ancestor covers only the first viewport. (`z-999` itself is valid — see D9.) |
| k | ~~`useLocalhost.ts:4`~~ | **✅ Fixed in P0-1.** Read `localStorage` during render (latent SSR crash); misnamed; and wrote `JSON.stringify(value)` while `BoardsStore.ts:29` read `=== 'true'` on the same key. Replaced by `app/hooks/useLocalStorage.ts`; the duplicate encoding is gone with the dead field. |
| l | ~~`SizeStore.ts:12`~~ | **✅ Fixed in P0-3.** `window.onresize =` clobbered any other listener, was never removed, and was unthrottled. Resize is now owned by `useAvailableBoardBox`: `addEventListener`, coalesced to one measurement per animation frame, removed on unmount, and paired with a `ResizeObserver` and `visualViewport`. |
| m | `SkibidiBoard.ts` | 183-line dead copy of the old `dominoBoard.ts` (itself now deleted), never imported. Still present; scheduled for deletion in **P2-1**. |
| n | `app/constants.ts` | Unused heterogeneous enum. |
| o | ~~`dominoBoard.ts:110`~~ | **✅ Fixed in P1-6 (row 18, stage 1).** `findFirstEmpty` used `i < board[i].length` as the *outer* loop's condition, reading the row it had not reached yet, so at `i === n` it threw rather than merely mis-bounding — it never fired only because every caller had already checked the board was not full. `dominoBoard.ts` is deleted; the replacement `firstEmpty()` in `scripts/generate-boards.ts` bounds each loop by its own axis. |
| p | `layout.tsx:17` | Metadata is still `"Create Next App"`. |
| q | `globals.css:15` | A dark-mode block darkens `body` while every game surface is hard-coded light grey. |
| r | ~~`DominoClient.tsx:33`~~ | **✅ Fixed in P1-1.** `onContextMenu` was bound to the whole wrapper, so right-clicking the difficulty slider or the level arrows rotated the piece too, and Android fired it on long-press. The handler is gone with the orientation mode it toggled. |
| t | `DominoClient.tsx:19` | **The only startup path has no failure path.** `getCurrentActiveBoard().then(...)` has no `.catch`: the board arrives from a `"use server"` action called in `useEffect`, so one rejected POST — a dropped mobile connection, a server restart — leaves the app showing `no board` forever, with no error, no retry and nothing in the console. Found while diagnosing the E2E flake; it is **not** that flake's cause (the action was observed succeeding in every captured failure), but it is the reason a transient failure there is unrecoverable rather than a blink. Fix with the rest of D10-c, which removes the round-trip entirely by SSR-ing the board as a prop; until then any retry belongs next to that work, not bolted on. |
| s | repo-wide | No tests, no runner, no CI. `motion/react` animates everywhere with no `prefers-reduced-motion` handling. |

### 1.11 Content

`dominoBoards.json` holds **2** day-entries (18 boards); `Boards.ts:51` indexes
`data[daysSinceEpoch % 2]`, so the game alternates two sets forever — a returning player meets
their day-1 puzzles again on **day 3**, the exact retention moment a daily game lives or dies.
Within a day there are 9 levels: three sizes (6×6/7×7/8×8) × three levels that differ **only by
rock count** — 8/6/4, 9/7/5, 10/8/6 respectively (`Boards.ts:28-36`). So within a difficulty the
ramp is one notch wide, and fewer rocks means *more* cells. Then `LevelSelector.tsx:8` caps at
`level < 3` and the screen simply sits there. No streak, no day-complete state, no archive,
nothing telling the player to come back. The generator that would fix this is exponential *and*
emits the wrong format (D10-j).

---

## 2. Goals / non-goals

**Goals**
1. The app builds, and the board is correctly laid out and correctly clickable at any viewport or zoom.
2. One coherent placement verb that works identically with mouse, finger, and keyboard.
3. Recoverability: undo, reset, and honest feedback when stuck.
4. A new puzzle every day for a committed horizon, with a defined replenishment path.
5. A regression suite over the rules and the layout invariants.

**Non-goals**
- Accounts, leaderboards, backend. Progress stays in `localStorage`.
- A visual redesign. Keep the look; change it only where correctness demands.
- *Solving* boards at runtime. Generation is a build-time pipeline (see P1-6) — note this is a
  weaker non-goal than the draft's blanket "no runtime generation", which contradicted Goal 4.

---

## 3. Plan

### P0 — unblock and make it correct

**P0-1. Fix the build — both `localStorage` sites.** *Nothing else matters until this lands.*
Add `npm run build` to the acceptance gate, not just `lint`.

1. **`LevelStore` (`BoardsStore.ts:28-30`) — delete, don't guard.** The field, its read and its
   setter are all dead: the only consumer is commented out at `:95-97`, and `Tutorial.tsx:13` uses
   `useLocalhost` instead. Removing `hasSeenTutorial` from `LevelStore` entirely removes the
   server-side access, so no guard is needed. (An earlier draft said both "change the guard" *and*
   "delete the field", which is incoherent — deleting it is the fix.)
2. **`useLocalhost` (`useLocalhost.ts:4`) — make it server-safe and exception-safe.** It reads
   during render, so it is a live landmine that D10-c detonates (see D1). Initialise from the
   `initialValue` on the server, hydrate from storage in a `useEffect`, wrap every access in
   `try/catch` (Safari private mode throws on write; storage may be blocked entirely), and handle
   malformed JSON by falling back to `initialValue` rather than throwing. Note this is **not** a
   guard on `typeof localStorage`, which is precisely the check that fails on Node ≥22.

**P0-2. Stop the store being a module singleton.** Construct it in the provider —
`const [store] = useState(() => new RootStore())` in `StoreWrapper` (`provider.tsx:7`) — so the
server gets a throwaway and each client its own. Move `StoreWrapper` inside `<body>`; it currently
wraps `<html>` for no benefit and hands the document element to a client render.

**P0-3. Fix the gutter layout.** This is the visible "zoom breaks it" bug.
- `min-width: 0; min-height: 0` on the gutter flex items — the missing declaration behind D3.
- Font size derived from the cell, not a constant: `clamp()` / `calc(var(--cell) * 0.55)`.
- Account for the 8px border in the width budget, or move the border outside the measured box.
- Delete the duplicate right-hand `VerticalNumbers` (`ClientBoard.tsx:74`), leaving **one** gutter.
- **Size the remaining gutter at 0.7 cell, not 1 cell.** This is load-bearing for the acceptance
  criterion below, and no earlier draft actually specified it: at a full cell the shell is
  `9·cell + 8`, which cannot fit an 8×8 board on a 360px screen at any usable cell size.
  0.7 cell is the smallest gutter that still holds a **two-digit** label — sums reach 13, and at
  a 0.55·cell font a two-digit label is ≈0.61·cell wide. Validate with the widest label, not `8`.
- Constrain by height as well as width — `svh`, not `vh`, for the mobile URL bar — and stop the
  centred-flex overflow clipping.
- **The size formula must budget the whole board shell, not the grid.** Solve for the cell:
  `cell = (min(100cqi, availH) − gutter − border) / n`, where `availH` is the viewport height
  *minus* the difficulty slider, piece tray, level controls and safe-area insets. A 360px-wide
  board still overflows a 400px-tall landscape screen once that chrome is counted, so the height
  term is not optional.

> **Implemented in row 11, with three corrections measured along the way.**
>
> 1. **The chrome must not be sized from the board.** `availH` is the viewport minus the chrome,
>    so anything in the chrome that derives its size from the cell closes a feedback loop. The
>    piece tray drew its dominoes at the board's own cell size: measured, the cell crept
>    48 → 50 → 51 over successive frames before settling. The tray now uses a constant.
>    `e2e/layout.spec.ts` asserts the layout does not creep.
> 2. **Centring only strands content when the container height is definite.** This section
>    implies `min-h-screen` + `justify-center` clips the top of an overflowing board. It does
>    not — a `min-height` container grows instead, and measured at 800×400 nothing is clipped.
>    Replace the `min-h` with `h-svh` and it clips immediately. The fix (auto margins) is kept
>    because it makes the distinction stop mattering, but the defect as stated was not real.
> 3. **The floor is one-sided.** Below `MIN_CELL_PX` the board stops shrinking to the viewport
>    *height* and the page scrolls; the *width* budget is never overridden, because horizontal
>    overflow is forbidden outright and vertical scrolling is not. Without a floor, 800×400
>    yields ~11px cells: arithmetically correct, unplayable.
>
> Sizing is measured from the page (`useAvailableBoardBox`) rather than from `innerWidth`, which
> also retires `SizeStore`'s clobbering unthrottled `window.onresize` (D10-l). `SizeStore` remains
> only as the pre-measurement fallback.
>
> **Corrected in the row-11 follow-up, after review:**
>
> 4. **The label font was 0.55 cell and overflowed; it is 0.5 now.** A font's content area --
>    ascent plus descent -- is roughly 1.3x its em box, and `line-height: 1` shrinks the line box
>    without shrinking the glyphs. Measured at 360×640: a 21px label needed 27px of height inside
>    a 26px gutter. The gutter must hold `font * ~1.3`, so the fraction has to stay under
>    `GUTTER_FRACTION / 1.3` = 0.538. The test that was meant to catch this measured the label
>    *element*, whose size is set by inline style, so it only restated the style and passed;
>    `scrollWidth`/`scrollHeight` against `clientWidth`/`clientHeight` is what measures the text.
>    The gutter's two-digit claim is now verified by driving every label to the widest value the
>    game can produce (13), rather than by the ≈0.61-cell model above -- and by sweeping all nine
>    shipped difficulty/level combinations, since the two-digit targets (10, 11, 13) appear on
>    only two of them and the served content rotates daily.
> 5. **Safe-area insets are implemented, with a stated limit.** `viewportFit: 'cover'` (without
>    which `env(safe-area-inset-*)` is always zero), `--safe-*` variables, insets subtracted from
>    the measured budget and kept clear by the page padding. The indirection through variables is
>    deliberate: `env()` cannot be read from script, and Chromium cannot emulate a device's safe
>    area, so the browser tests drive the variables. **They exercise the plumbing, not any real
>    device's values** -- nothing in this suite proves what an actual iPhone reports.

**P0-4. Fix the piece-overlay hit regions (D4).** `pointer-events: none` on the `Pieces` layer
(`Pieces.tsx:31`), removal handled on the cells instead; and `fill="none"` rather than
`"transparent"` on the decorative outline rects.

> **Measured during implementation:** of the three, only *removal handled on the cells* is
> load-bearing for D4. Once the overlay's own click handler is gone, restoring
> `pointer-events: auto` does not bring the defect back -- the click bubbles to the grid and is
> routed by cell index regardless. The other two remain required, as defence in depth and as a
> precondition for P1-2's cell-level handlers, but the E2E suite asserts them as properties
> rather than through board-state behaviour, because no *board-state* difference distinguishes
> them today. Other observable behaviour does differ: the pieces layer is a sibling of the
> cells, not their ancestor, so an interactive overlay swallows the click before `BoardSquare`'s
> own handler (today, the placement sound) ever runs.

**P0-5. Stable `CurrentBoardStore` instances, keyed by `puzzleId`.** A `Map` keyed by the opaque
**`puzzleId`** defined below — *not* by `difficulty:level`, and not by a board hash —
**populated eagerly in `setBoards`** (an action) and cleared there, with `currentBoard` a pure read. Populating lazily inside the computed is the trap: with an
observable Map MobX throws ("computed values are not allowed to cause side effects"), and with a
plain Map it silently reintroduces unstable identity on a cache miss.

**Define the day and the identity before writing the key** — `BoardsResponse` currently carries no
day index at all, and the board is fetched exactly once on mount (`DominoClient.tsx:16`), so a key
that merely *supports* a day index changes nothing by itself. Specify:
- **Is a "day" UTC or the player's local date?** (Recommend local, matching player expectation;
  UTC makes the daily reset land mid-afternoon for some.)
- **One identity, used everywhere.** A stable, opaque **`puzzleId`** carried in the payload,
  minted by the generator (P1-6) from date + difficulty + level. It is the *only* key for the
  store Map (P0-5), persistence (P1-7) and the archive — earlier drafts variously proposed
  `dayIndex:difficulty:level`, `puzzleId`, and a board hash for these three, which is how state
  and content identity keep entangling. It must not be derivable by rotation.
- **Invalidation is a separate field.** A `definitionHash` (or `contentVersion`) over the board
  definition, used *only* to detect that a stored session no longer matches its puzzle — never as
  an identity. This is what lets a puzzle be corrected without orphaning saved progress.
- **Interim IDs, because P0-5 lands before the generator (P1-6).** Mint IDs for the existing 18
  boards now as a one-time data migration — write them **into `dominoBoards.json` as a literal
  `puzzleId` field**, do not compute them at runtime from array position, or the ID stops being
  stable the moment the file is reordered or extended. Use a scheme the generator can keep
  (`v1-<seq>-<difficulty>-<level>`) and freeze the existing 18 forever; P1-6 mints new IDs in the
  same namespace rather than renumbering.
- **Rollover is an event, not a key format.** Re-check the date on `visibilitychange`/focus and
  refetch when it has changed.
- **What happens to an unfinished board at rollover.** Recommend: keep it playable and reachable
  from the archive; never silently swap the board under an active player.
- Separate **immutable puzzle definitions** from **mutable play sessions**. Today they are one
  object, which is why play state and content identity keep entangling.

**P0-6. De-duplicate the win check (D6).** Delete the inlined copy at `BoardsStore.ts:34-35`; drive
completion from a `reaction` on the single `CurrentBoardStore.completed` getter. Add the
board-full predicate there as a named, separately testable getter — as an assertion protecting the
D6 invariant, not as a bug fix. **Also resolve D10-d2 here**, since this is the change that
touches the sum getters.

> **As landed.** The predicates live in `app/stores/boardRules.ts` as pure functions rather than
> as methods, because a live MobX-backed session cannot hold a sparse board — MobX normalises
> holes away — so the `flat()/every()` trap is only testable against a decoupled function.
> `completedByRules = isBoardFull && targetsMatch`; the stored flag is written only by
> `LevelStore`'s reaction. Note that the `===` in `targetsMatch` is defensive typing, not
> test-covered behaviour: both operands are always strings, so `==` would behave identically.

**P0-7. Guard `removePiece` (D7).** Resolve a clicked cell to its piece's anchor, so either half
works; reject `-1`/`null` explicitly; bound-check. Load-bearing for D6.

**P0-8. Hover state onto `CurrentBoardStore`, cleared on pointer leave (D8).**

**P0-9a. Fix the tutorial's correctness bugs now (D9).** The rule text is the single
highest-value change in this document, and free. Ship early, before the input rewrite:
- Correct the stated rule (pip sums, not piece counts — see the header).
- Add a **skip** button, removing the hard gate.
- `fixed inset-0` instead of `absolute w-full h-full`.
- Size the tutorial board off the same shell formula as the real board (P0-3), not `default: 96`.

Deliberately **not** in P0-9a: the instructions describing *how to place a piece*, which still say
"right-click to switch" and "click to place". Those describe a verb P1-1 replaces, so rewriting
them now means writing them twice.

**P0-9b. Rewrite the tutorial's input instructions.** ✅ **Done in row 13**, with P1-1, teaching the
verb that actually shipped: drag toward the neighbour, tap for the unambiguous case, tap again to
choose, and the keyboard equivalent. It previously described a right-click mode toggle that no
longer exists and never worked on a phone. (The hard gate was removed in P0-9a for the same
reason it is mentioned here: leaving a known-incorrect one in place until row 13 would have made
every intermediate build awkward to test.)

**P0-10. Tests — Vitest harness.** *(Was P2-1; promoted because P0 changes completion, removal,
store identity and board state — the exact rules most in need of protection. Pinning them
afterwards pins the rubble.)* `package.json` has **no `test` script** today, so
  define it as part of this. **Characterise only rules that exist today** — the point is a safety
  net *before* P0 changes anything, so it must not assert behaviour P0/P1 has yet to build:
  `correctHorizontalValues`/`correctVerticalValues`, `completed` as currently defined,
  `setPieceOnBoard` placement and rejection, `removePiece` for values `1` and `2` (its only
  currently reachable inputs), and the D6 pairing invariant.
  Tests for the *corrected* removal behaviour — either half, rocks, board edges — land **with
  P0-7**, and undo round-trip tests land **with P1-3**. Writing them at P0-10 would assert
  behaviour that does not exist yet and fail on arrival.

  > **Harness gotcha, found while building this.** Under vitest's jsdom environment, Node's own
  > inert global `localStorage` **shadows jsdom's Storage** — `window.localStorage.setItem` is not
  > a function out of the box. This is the same hazard as D1, now in the test harness. Any test
  > touching storage must install its own in-memory `Storage` rather than trusting the ambient
  > one; `vi.stubGlobal` is not sufficient because the property is an own property of `window`.

### P1 — make it good to play

**P1-1. One placement verb: drag direction.** Press any point of a cell, drag toward a neighbour,
release. The drag vector determines **both** orientation and which neighbour — which deletes the
orientation *mode* from the input path entirely: no right-click (D10-r), no toggle button, no `R`
key, no selected-piece state to forget you're in. A tap without drag places into the only legal
direction if exactly one exists, else shows candidates for a second tap.

This replaces the current half-cell rule (`CurrentBoardStore.ts:81,99`), which is undiscoverable,
gives a 16px target on a phone, and *silently falls through to the opposite direction* when the
preferred neighbour is occupied — violating the rule exactly when the board gets interesting.
Keep the piece tray as a **legend** (this one scores 1, this one scores 2), not a mode selector.

Platform mechanics that must be specified or it will not work:
- **Touch pointers get implicit pointer capture**, so per-cell `pointermove` fires on the *original*
  cell, not the one under the finger. Either `releasePointerCapture` in `pointerdown` and resolve
  with `document.elementFromPoint(...).closest('[data-cell]')`, or keep capture on the grid and
  cache the rect at `pointerdown`. Prefer the former — it keeps zero coordinate arithmetic.
- **Do not keep `onClick` alongside pointer handlers.** Mobile synthesises a compat `click` after
  `pointerup`; you will place two dominoes per tap.
- `touch-action` on the grid must be **static, in CSS** — changing it from JS does not affect an
  in-flight gesture. See the pinch-zoom policy below for which value: **`pinch-zoom`, not `none`**.
  `touch-action: manipulation` on the difficulty buttons and the level arrows -- i.e. on whatever is
  actually tappable. **Not** the piece tray: P1-1 makes it a legend, so it takes no input at all and
  a policy there covers nothing. (Row 13 put the class on the legend alone and asserted it with a
  `.first()` selector, which passed while every real control had no policy; corrected in the
  follow-up, and the test now names the controls by role.)
- `-webkit-touch-callout: none` — `select-none` sets `user-select` only; iOS still shows the
  long-press magnifier mid-drag.
- Never `preventDefault()` in `onTouchMove` — React attaches it passively; the answer is
  `touch-action`. (`pointermove` is not passive, which is another reason to go all-pointer.)
- Handle `pointercancel` / `lostpointercapture` and drags that leave the grid.

**Keyboard is part of this item, not P1-8.** Goal 2 promises one verb across all three inputs, and
the drag model maps onto the keyboard exactly — an anchor plus a direction:

| Key | Action |
|---|---|
| Arrows (no anchor) | Move the focused cell |
| Space / Enter | Set the focused cell as the anchor — **always**; never a placement or a removal |
| Arrows (anchor set) | Choose the neighbour → commits orientation and places |
| Escape | Clear the anchor |
| Delete / Backspace | Remove the domino occupying the focused cell |
| `Ctrl/Cmd+Z` | Undo (P1-3) |

Focus must stay predictable across every transition: after placing, focus stays on the anchor cell;
after removing or undoing, focus moves to the affected anchor; on completion it moves to the
Next-level control. No mode is entered that Escape cannot leave. (P1-8 covers focus *structure* —
roving tabindex, roles — not this state machine.)

> **Two clauses of this paragraph are settled in row 13; the completion-focus clause is deferred to
> P1-4 (row 15), and P1-1 is therefore not complete without it.** There is nothing focusable to move
> to today: the level arrows are `motion.div`s with an `onClick`. **Row 15 closes this with the
> completion card's own Next button** — a real `<button>` introduced and focused by the completion
> feedback itself, which is where the transition happens. It does not wait on row 19: converting the
> separate level arrows is P1-8's job and independent of this. Row 13 implements the rest of the
> paragraph — focus stays on the anchor after placing, follows a removal to the pair's anchor, and
> Escape leaves the one mode there is.
>
> **Space/Enter is the anchor key and nothing else.** Row 13 delegated it to the pointer's `tap()`,
> which made it place immediately on a one-direction cell and *remove* on an occupied one —
> contradicting this table twice. The pointer may commit without asking, because the finger is
> already on the cell it means; the keyboard's direction is always a second key, so guessing buys
> nothing and reintroduces exactly the "sometimes it does X" ambiguity P1-1 exists to delete.
> Corrected in the row-13 follow-up: activation and tap are separate paths, and a unit test pins
> the difference so neither drifts onto the other.

**Pinch-zoom vs `touch-action`.** These genuinely conflict: `touch-action: none` on the grid kills
pinch *over the board*, which is the one place a low-vision player most needs it, while P2-2
insists `userScalable` stay enabled.

Resolve it with a **static** policy. Toggling `touch-action` on `pointerdown` does **not** work —
the value is latched when the gesture begins, which is the same rule stated three bullets above;
an earlier draft proposed exactly that and contradicted itself. The policy:

- **`touch-action: pinch-zoom` on the grid** (static, in CSS): the browser keeps two-finger pinch
  and suppresses one-finger pan/scroll, which is what a one-finger drag needs. **Verify on real
  iOS Safari and Android Chrome before relying on it** — support for the non-`none` keyword
  combinations is the weakest part of this plan.
- **Tap is the baseline and never depends on any of this.** If `pinch-zoom` proves unreliable on a
  target browser, drop drag on that browser and keep tap plus pinch. Never trade away pinch.

> **Implemented in row 13.** The verb lives in `app/stores/placement.ts` (pure direction rules) and
> `PuzzleSession` (the state machine). A drag, a tap and an arrow key all reduce to an anchor plus a
> direction before anything is placed. `selectedPiece` is deleted, the tray is a legend, and
> `onContextMenu` is gone with it (D10-r).
>
> Platform findings, each measured rather than assumed:
>
> 1. **`pointerleave` fires after every touch `pointerup`.** A touch pointer stops existing when the
>    finger lifts, and the browser then fires `pointerout` and `pointerleave` all the way up the
>    tree. Wiring `pointerleave` to full cancellation therefore dismissed the candidates the tap had
>    just offered, so an ambiguous tap did nothing at all on a touch device. Measured: every tap
>    produced `pointerdown, pointerup, pointerout, pointerleave×8, touchend, click`. `pointerleave`
>    and `pointercancel` now abandon only an in-flight *drag*; a pending offer is dismissed by
>    Escape, by a tap elsewhere, or by the board losing focus.
> 2. **The implicit capture is left in place, and the bullet's `releasePointerCapture` route was
>    never actually taken.** Row 13 shipped `e.currentTarget.releasePointerCapture(...)` in
>    `pointerdown` believing it followed the bullet above. It did not: `currentTarget` is the grid,
>    while the implicit capture belongs to `e.target`, the cell. Measured -- the call does not even
>    throw, it silently no-ops, so the `try/catch` around it never fired and the dead code looked
>    load-bearing for a whole review cycle. The drag worked entirely because of `elementFromPoint`.
>
>    Corrected in the row-13 follow-up by **removing** the failed release rather than fixing it,
>    because keeping the capture is measurably better: it funnels every event to the grid even when
>    the finger leaves the board, so an off-board release still resolves the gesture. Measured --
>    a drag ending outside the board still delivered `pointerup` to the grid (`target=2,2`,
>    `elementFromPoint=none`), which clears the gesture; with capture genuinely released, that
>    `pointerup` retargets to whatever is under the finger and the grid never hears it.
>
>    The spec bullet's two options are therefore **three**: release and hit-test, cache the rect, or
>    *keep capture and hit-test*, which is what ships. The third keeps the bullet's "zero coordinate
>    arithmetic" property and is strictly more robust than the first.
> 3. **`lostpointercapture` *is* wired to `cancelDrag`, and row 13's reason for omitting it was
>    false.** That reason (capture is released in `pointerdown`, so the event fires immediately and
>    would kill every drag on its first frame) was recorded before it was measured, and rests on the
>    release that finding 2 shows never happened. Measured: with the capture left alone,
>    `lostpointercapture` fires *after* `pointerup`. Arriving there costs nothing, because
>    `cancelDrag` discards only a `drag` and by then a placement has cleared the gesture or an
>    ambiguous tap has turned it into a pending offer. What it buys is capture lost *before* the
>    release, with no `pointercancel` to follow, which would otherwise leave a drag armed with no
>    event left to close it. The after-`pointerup` ordering is asserted in `e2e/touch.spec.ts`.
>
>    **That mid-drag case cannot be exercised in Chromium.** Measured: releasing the implicit touch
>    capture from the cell that owns it genuinely takes effect -- `hasPointerCapture` goes false and
>    the next `pointermove` retargets to the cell under the finger -- but **no `lostpointercapture`
>    is dispatched for it**, at the cell, the grid or the document. Chromium also queues the event
>    until immediately before the next pointer event, so a release with nothing in flight fires
>    nothing at all. The handler's contract is therefore pinned in `tests/hover.test.tsx`, where the
>    event can be dispatched directly, and the touch suite contributes the evidence that wiring it
>    costs nothing on the normal paths.
> 4. **`-webkit-touch-callout` cannot be verified in Chromium at all.** Blink does not implement it,
>    so it computes to the empty string, and the CSSOM drops the declaration from `cssText` even
>    though the built stylesheet ships `board-grid{touch-action:pinch-zoom;-webkit-touch-callout:none}`.
>    The test fetches the stylesheet as text and asserts the declaration is in the shipped bytes.
>    Whether it suppresses the long-press magnifier **needs a real iOS device**.
> 5. **`touch-action: pinch-zoom` computes correctly in Chromium** and is asserted both as a value
>    and as *not* an inline style, which is the "static, in CSS" half of the policy. Chromium's
>    emulation is not WebKit: **real iOS Safari still needs checking**, and the fallback if it
>    proves unreliable is unchanged -- drop drag there, keep tap and pinch.
> 6. **Compatibility clicks are covered by a sharper test than "two dominoes".** The synthesised
>    `click` targets the *release* cell, which is occupied by the domino just placed -- so a second
>    handler running the verb would **remove** it. A domino still present after the click has
>    arrived is the evidence.
>
> **The intermittent E2E startup failure, diagnosed.** A run would occasionally fail with the page
> stuck on `no board` and nothing else to go on. Three hypotheses were wrong before the evidence
> arrived: it is not a slow server (measured: eight concurrent requests to a freshly started
> production server returned in 27ms), not a slow or failing Server Action (measured: in every
> captured failure the action had never been called at all), and not app code throwing (no page
> error, no rejection).
>
> The cause is **socket exhaustion on the test machine**. Measured: one full run leaves ~2500
> sockets to the test port in `TIME_WAIT`, and consecutive runs accumulate them; under that
> pressure Chromium fails a request at the transport layer with `ERR_NO_BUFFER_SPACE`. When the
> request it kills is a JS chunk, the bundle never arrives, **React never hydrates**, the
> `useEffect` that loads the board never runs, and the page sits at `no board` — with no error in
> the page, because a `<script>` that never loads fires nothing the page can see and leaves
> `readyState` at `complete`. Captured verbatim:
> `FAILED GET /_next/static/chunks/18a5a133fb68ca26.js :: net::ERR_NO_BUFFER_SPACE`.
>
> Hardened in `e2e/openBoard.ts`: every startup wait reports hydration state, body text, the
> action's fetches, the script tags present, the request-level failures and the retry rule's
> verdict, so this class of failure names itself instead of presenting as a missing element.
>
> The one automatic reload is decided by `shouldRetryStartup` in `e2e/startupRetry.ts` — a pure
> function with its own tests, because the condition it guards appears about once in twelve full
> runs and so cannot be checked by running the browser suite. A reload requires **all** of: a
> *critical* request failed at the transport layer (the document or a `/_next/static/chunks` script
> — a lost sound or image cannot stop hydration); `hydrated === false`, since if React took control
> the bundle arrived and anything after that is the app's defect to report; and no reload used yet.
> The vocabulary is kept to what was measured: `ERR_NO_BUFFER_SPACE` alone is diagnosed as socket
> exhaustion, while `ERR_INSUFFICIENT_RESOURCES` and `ERR_NETWORK_CHANGED` are retried as transient
> resource failures **with no cause claimed**. Every decision is announced, refusals included.
>
> An earlier version of this rule was looser than the sentence it printed — three codes, any failed
> resource, and a confident "the machine ran out of sockets" — which is the shape of harness that
> eventually retries past a real defect and blames the network.
>
> The levers if it persists are fewer Playwright workers or a pause between runs; the structural fix
> is D10-c, which by SSR-ing the board removes both the round-trip and the "nothing renders until
> hydration" property that makes this failure total.
>
> Touch is exercised in a real touch context (a mobile device descriptor: `hasTouch`, `isMobile`,
> coarse pointer), not a phone-sized desktop viewport, and input is dispatched through CDP
> `Input.dispatchTouchEvent` so drags are real touch sequences. A guard test asserts the context is
> actually touch-enabled, so the file cannot quietly stop testing what it claims to.

**P1-2. Hit-test from the cell, not from arithmetic.** Put the handler on `BoardSquare` (or delegate
via `closest('[data-cell]')`). The cell index then comes from the browser's own hit-testing — **no
grid-to-cell index arithmetic**, correct at any zoom, DPR, or fractional cell size. As of row 13 no rect is read at
all: the half-of-the-cell rule that needed one was replaced by the drag direction, so `hover` is a
cell index and nothing else. This is *robustness*, not a zoom fix — the current math is already self-consistent
(see §0).

> **Markers landed early in row 10; implemented in row 12.** `data-cell="i,j"`, plus
> `data-piece`/`data-at` on the overlay and `data-select-piece` on the tray, were added in row 10
> so the browser tests could address cells and pieces at all.
>
> The store now holds a `CellHover` -- a cell index plus `fx`/`fy`, fractions of that one cell --
> instead of a pixel offset into the grid. `ClientBoard` resolves the cell with
> `closest('[data-cell]')` from the event target, and reads exactly one rect, that cell's, purely
> to decide which half of it the pointer is in. `squareSize` no longer takes part in hit-testing
> at all.
>
> Two clarifications measured while implementing:
>
> - **The `ResizeObserver` has not gone away, and cannot.** P0-3's sizing still uses one. What
>   changed is its blast radius: it now affects **visible sizing only**. A stale or wrong
>   measurement makes the board the wrong *size*, which anyone can see, instead of putting clicks
>   in the wrong *cell*, which nobody can.
> - **`fx`/`fy` are gone as of row 13.** They fed the half-of-the-cell rule, which the drag
>   direction replaced, so the last cell-relative arithmetic went with them. Hit-testing now reads
>   no rect at all: `hover` is a cell index and nothing else.
> - **A translation does not discriminate between the two approaches.** The old code measured the
>   pointer against the grid's own rect, which moves with the grid, so it survives
>   `translate(...)` unchanged. The browser tests use a `scale()` and a non-uniform row instead --
>   and the distortion has to exceed one cell, or the old arithmetic rounds to the same row and
>   the test proves nothing.
>
> One gap found and closed while mutation-testing: every test in the suite read the cell index and
> the piece index from the same `data-*` labels, so transposing `data-cell` to `j,i` left all nine
> green while pieces rendered in the wrong place on screen. There is now one test that crosses
> from labels to pixels -- the placed piece must overlap the box of the cell that was clicked --
> using an off-diagonal cell, since a transposition maps the diagonal to itself.
>
> **Corrected after review:** the click handler ignored its own event and activated whatever the
> last pointer move had stored. Every mouse click is preceded by a move over the same cell, so it
> looked equivalent -- but it made clicking depend on the pointer's history: a click dispatched
> straight at a cell placed nothing, and a stale hover would have made a click act on the previous
> cell. The click now resolves its own cell from its own event.

**P1-3. Reset and undo.** Reset is ~5 lines and is the escape hatch for every other bug here; there
is no restart anywhere in the UI today (D10-i), so a mis-solve requires reloading the page. Undo
matters because removal is instant, silent, and destructive. Bounded move stack + `Ctrl/Cmd+Z`.

> **Implemented in row 14.** The stack lives on `PuzzleSession` as `Move[]`, bounded at
> `MAX_UNDO = 60`. Sessions are never discarded — P0-5 requires exactly that — so an unbounded stack
> grows for as long as someone keeps playing.
>
> 60 is a bounded-memory and usefulness choice, **not** coverage of a "longest possible game": there
> is no such quantity, because a piece can be placed and removed indefinitely. (An earlier draft of
> this note claimed otherwise and was simply wrong.) For scale, the largest shipped board has 58
> playable cells — 8x8 with 6 rocks, measured across all 18 — so 29 dominoes, and filling it once
> then clearing it is already 58 moves. What the cap buys is that the recent past is always
> undoable; going further back is what Reset is for.
>
> A move records the cells it touched and **their prior contents**, not "a placement" or "a
> removal". Undoing is then one operation rather than two inverses that can disagree, and undoing a
> removal gives back *the same domino* instead of a re-derived one — which matters because a cell's
> value encodes which half of which orientation it is, so a plausible-but-wrong restoration only
> surfaces later, when `pairAt` can no longer resolve the piece. Every board write goes through
> `placeToward` or `removePiece`, and both record, so there is no path that mutates and forgets.
>
> **No redo, deliberately.** Undo pops and never pushes. A redo stack has to answer what happens
> when you undo, place something else, then redo, and every answer is a rule the player must learn.
>
> **Undo recomputes `completed`** (D10-h). The completion reaction only ever sets that flag *true*,
> and it disables pointer input — so undoing a winning move would otherwise leave the board flagged
> solved and refusing input, a soft-lock reached by the action meant to escape one. Reset clears it
> outright, along with the stack: those moves describe a board that no longer exists, and undoing
> into a freshly cleared grid would write dominoes back onto it.
>
> **Undo gets a button as well as the shortcut, which the spec did not ask for.** `Ctrl/Cmd+Z` is
> the only affordance named above, but this game is built phone-first (P0-3) and a phone has no
> Ctrl key: a keyboard-only undo is no undo at all for most of the people playing, while "removal is
> instant, silent and destructive" is just as true under a finger. Both controls are real
> `<button>`s — the level arrows beside them are `motion.div`s with an `onClick`, which is exactly
> why P1-1's completion-focus clause had to be deferred, and new controls should not add to that
> pile.
>
> **Not done: Reset does not confirm.** A single mis-tap discards the whole board, and the stack is
> cleared so it cannot be undone. This follows the spec's "~5 lines" framing rather than inventing a
> confirmation flow, but it is a real way to lose work and should be revisited in P2.

**P1-4. Completion feedback.** Winning currently sets `pointerEvents: none` and plays a file named
`winSilent.mp3` — the game appears to *freeze* at the moment it should celebrate. Needs a visible
celebration and a Next/Replay affordance within 500ms, plus `aria-live`. Use `inert`, not
`pointerEvents: none`. Play `win.mp3`, which already exists and is unused.

> **Implemented in row 15.** `CompletionCard` renders on completion with `role="status"` and
> `aria-live="polite"`, a **Next level** button and a **Play again** button. The board shell is made
> `inert`.
>
> **`inert` is not a tidier `pointer-events: none`.** The old mechanism stopped the mouse and
> nothing else: every cell of a won board stayed tabbable and stayed announced, so a keyboard or
> screen-reader user could go on "playing" a finished board. `inert` removes the subtree from
> hit-testing, the tab order and the accessibility tree together — asserted in `e2e/completion.spec.ts`
> by focusing the grid inside the inert subtree and checking focus does not land.
>
> **P1-1's deferred completion-focus clause closes here**, not in P1-8 as row 13 first assumed. The
> obstacle was that nothing focusable existed to move to — the level arrows are `motion.div`s with
> an `onClick`. The card brings its own real `<button>`, so the clause needed no change to them. On
> the last level of a difficulty there is no Next, and focus goes to Play again: the rule is "the
> primary action", and there must always be one.
>
> **The win sound was `winSilent.mp3` next to an unused `win.mp3`**, so winning made no sound at
> all. Now `win.mp3`. This has its own test because it is otherwise invisible — found by mutation,
> where the swap back passed all 314 other tests.
>
> **The 500ms budget is measured from the winning move**, which took a second attempt. The first
> version started its clock before the *whole* puzzle was played and then waited with a 500ms
> locator timeout — so the window opened only once every move was already in, and it could not have
> failed however slow the celebration was. It also asserted `toBeGreaterThan(0)`, which is true of
> any elapsed time.
>
> The test now plays every move but the last, holds the pointer down over the releasing cell, arms a
> one-shot in-page `pointerup` listener, and releases. The clock starts at the winning move itself,
> which took three attempts to get honest:
>
> 1. The first version started it before the *whole* puzzle was played — it could not fail.
> 2. The second set `t0` inside `page.evaluate`, which had to return to Node before Node could send
>    the release, so a round trip sat inside the measurement.
> 3. The third armed a **bubble-phase** listener on `window`. React handles the board's
>    `onPointerUp` at its root *before* the event reaches `window`, so the application's entire
>    response to the winning move — placement, completion, render — happened before `t0` was read.
>    Measured: an 800ms synchronous stall inside `onPointerUp` still reported a ~300ms celebration.
>
> Now the listener is **capture-phase**, which runs before anything in the tree, and `t0` is the
> event's own `timeStamp` — the browser's timestamp for when the event was created, on the same
> origin as `performance.now()` and earlier than any listener can observe. The number therefore
> covers the whole response to the winning move rather than only the animation after it. Verified:
> the same 800ms stall now reports 1046ms and fails.
>
> It requires the card to be attached, **finished animating** (computed opacity ≥ 0.99) and
> **wholly** within the viewport. Opacity matters because Playwright counts a fully transparent
> element as visible: measured, the card attaches at ~13ms at opacity 0.06 and is legible at ~313ms,
> so `toBeVisible` alone accepted it 300ms early. Full containment matters for a reason found by
> applying it: at 360×640 the card sat at top 532 / bottom 652 of a 640px viewport — 90% visible,
> **with its buttons clipped**, on exactly the device most people play on. Any-intersection would
> have called that presented.
>
> That clipping is fixed rather than tolerated: the card scrolls itself into view with
> `block: 'nearest'` on mount, and focus then uses `preventScroll` so it does not undo it. Focusing
> alone was not enough, because it scrolls the *button* into view and leaves the rest of the card
> where it was.
>
> Verified by mutation — stretching the animation to 2s reports 1858ms and fails; an 0.8s delay
> reports 1047ms and fails; translating the card until only a thin edge shows fails; and removing
> the `scrollIntoView` fails at 360×640, which is what makes that fix load-bearing rather than
> decorative.
>
> **Both of row 14's deferred obligations are closed.** `e2e/completion.spec.ts` wins a board for
> real — read from the DOM, solved, and played move by move through the pointer verb — then checks
> the card, the focus, the inertness, and that Reset, Play again and Undo each release the win.
> Nothing sets `completed` directly, so a disagreement between the placement rules and the
> completion rules fails the test rather than hiding behind a flag.
>
> The solver that makes this possible lives in `e2e/solve.ts` and is **test-only**: the served
> puzzle is chosen by the server's clock, so no fixture can name its solution. It is deliberately
> *not* P1-6's solver — that one needs a node budget, a timeout behaviour and an answer for
> unsolvable positions, because it answers questions for the player (P1-5). This one answers one
> question for a test, from an empty board, where a solution is known to exist. Its output is
> checked against the rules for all 18 shipped puzzles rather than trusted.

**P1-5. Honest feedback and stuck-recovery.** The #1 quit reason in a deduction puzzle is a dead end
with twenty pieces down. Minimum: gate "green" on *line complete*, not *sum satisfied* (D10-g);
add a non-colour token (strikethrough / outline) so the red-green channel isn't the only one; a
shake/flash on rejected placement, which today does nothing at all
(`CurrentBoardStore.ts:122` returns silently); and **check**/**hint** actions — with the caveat
below.

> **Check and hint need a defined solver contract; "cheap because boards are single-solution" is
> misleading.** Uniqueness is a property of the *empty* board, and says nothing about an arbitrary
> partially-wrong position. Two traps: a board can be globally unsolvable with **no individually
> unsatisfiable line**, so "flag the first impossible line" is not well-defined; and a "forced
> move" from a wrong position may not exist at all. Specify instead: *hint* = run the solver from
> the current position; if it has no completion, say "a placed piece is wrong" (optionally naming
> the earliest move that breaks solvability, via the undo stack); if it does, reveal one cell the
> solver fills identically in every completion. That needs a real solver with a node budget and a
> defined timeout behaviour — scope it as such, or cut the feature.
Also: `navigator.vibrate(10)` on place, 25 on win — on mobile the hardware mute switch kills the
entire audio channel, so haptics *are* the feel budget.

> **Check and Hint landed in row 18e; the rest of P1-5 in row 16.**
>
> ### Check and Hint (18e)
>
> Both are built on `app/stores/solver.ts` and nothing else. `e2e/solve.ts` answers one
> question for a test, from an empty board, where a solution is known to exist; it has no
> budget, no answer for an unsolvable position and no notion of uniqueness, and it is not a
> player-facing solver.
>
> **Check** runs the solver from the current position and reports what it found, keeping
> three answers apart that a cheaper version would merge. *Solvable* and *more than one
> completion* are both "you are still in the game". *Unsolvable* is "a piece you have placed
> is wrong". *Budget-exhausted* is **"could not tell"**, and is the reason the solver has
> that verdict at all: reporting a stopped search as a mistake would send a player undoing
> correct moves. "Could not tell" also has to say what would change the answer, because the
> solver and its budget are deterministic: pressing the same button on the same board
> reaches the same limit, so the message asks for an undo or a change *first* and an answer
> second. An unqualified "try again" is an invitation to a guaranteed repeat.
>
> **Hint** reveals one cell and leaves the move to the player — it never places anything.
> "Forced" means every completion fills the cell the same way, which is exactly what the
> solver's `solved` verdict establishes: it looked for a second completion and found none.
> A `multiple` verdict cannot support the claim, because the search stops at two and two
> that agree prove nothing about a third — **and it cannot support the opposite claim
> either.** The first version of this said "no single move is forced", which is a statement
> about the board that a search stopping at two completions has no standing to make, and
> which is measurably false on the very fixture that exercises it: the `TWO_WAYS` 4x4 has
> exactly two completions and they agree on six of its sixteen cells, all six forced. The
> verdict is therefore `no-proven-hint` and reports only what the search did — *this search
> could not prove what any square holds* — which is not a complaint. Proving otherwise would
> mean enumerating every completion, unbounded on an 8x8 and needing a budget of its own;
> it buys the shipped game nothing, because every corpus puzzle is generated unique and
> rejected otherwise, so `multiple` is unreachable from a valid board and this is a
> fixture-only path. The cell is the first empty one in row-major order, because a
> hint that moved between presses would read as the game changing its mind. The value is
> named as the half it is — "the top half of an upright domino" — since the board shows pips
> and a bare `1` is a quiz.
>
> **How far back to undo.** The spec offers this as optional and it is what makes the advice
> actionable: "something is wrong" with twenty pieces down is the quit reason restated, not
> a remedy. It is a **backwards walk over the undo stack**, one move at a time. Binary
> search over the prefixes is the obvious cheap trick and it is wrong here — the stack holds
> removals as well as placements, so solvability is not monotone along it, and a test builds
> exactly that history: place, remove, place again, where prefix 1 is unsolvable, prefix 2
> is solvable and prefix 3 is unsolvable. The walk is bounded twice, by one budget shared
> across every probe and by a cap of twenty steps; either limit reports the problem without
> a number, which is a smaller claim rather than a wrong one. **An unknown distance is never
> rendered** — and the test for it was wrong twice, both times failing open. The first
> version only checked for digits, which "Undo null moves" satisfies; caught by
> mutation-testing. The second added word boundaries through a patch script whose Python
> string was not raw, so `\b` reached the file as two literal backspace characters and the
> regex could never match — a `not.toMatch` that cannot match passes for free, and passing
> is what a green test looks like. The guard is now mutation-tested against a message that
> satisfies every other assertion in that test and is caught only by this one.
>
> **Neither action touches anything.** Advice is pure and takes the board as an argument;
> the walk copies before it steps back. Nothing writes to the board, the undo stack or
> storage, and the unit tests assert that as byte-identical state rather than as "looks
> right afterwards" — a hint that nudged the snapshot would write a save the player never
> made and restamp its retention clock. The answer is cleared in `record`, the single
> chokepoint every board write already goes through, rather than alongside the outcome
> signal: the signal is a notification, and a placement reached without one would still have
> to invalidate the answer.
>
> **Reaching it.** Real `<button>`s, operated by Enter and Space and reached by Tab in a
> browser test with no pointer involved. The answer lands in a `role="status"`
> `aria-live="polite"` region that is present from the start and empty until asked — a live
> region created together with its text is a well-known way to have nothing announced — and
> the view keys on a counter rather than on the text, so pressing Check twice on an
> unchanged board answers twice. Polite rather than assertive, because it can arrive
> mid-drag.
>
> **The rest of P1-5 was implemented in row 16.**
>
> **Line state is honest now (D10-g).** `satisfied` requires the sum to match *and* the line to be
> full. A column summing to its target with cells still empty — 1+0+2+0 reaches 3 with half the
> column unplayed — is `neutral`, where it used to go green and tell the player they had finished a
> line they had not.
>
> **Colour is no longer the only channel.** Satisfied is struck through, like crossing a clue off a
> list; over is ringed. Both are legible in greyscale, and the ring is an `outline` rather than a
> border precisely because outlines take no layout space — a border would reopen the gutter overflow
> row 11 closed (P0-3). Screen readers get an `aria-label` saying "complete" or "over target",
> since neither strikethrough nor colour reaches them.
>
> **The contrast was worse than this spec recorded.** Measured against the `#e8e7e7` board:
> neutral `#ababab` is **1.86:1** and the old green `#4bce4b` is **1.66:1** — the state colour, the
> thing the player is meant to read, was the least legible element on screen. The new palette is
> measured, not chosen by eye: neutral `#5f5f5f` 5.17:1, satisfied `#15661a` 5.77:1, over `#a10000`
> 6.76:1. A unit test recomputes all three, and asserts the *old* palette would fail it.
>
> **A refused move now says so.** `PuzzleSession` records `lastOutcome` and an `outcomeTick`, and
> the view shakes the grid on a refusal. A counter rather than a flag, because two refusals in a row
> are two events — a view watching the outcome alone would sit still through the second, which is
> exactly when a player is jabbing at the board wondering what is wrong. The keyboard goes through
> the same signal, so a refused arrow key shakes as a refused drag does. A release over *no cell* is
> the pointer leaving the board, not a refusal, and is deliberately silent.
>
> **The sound stopped lying (D10-f).** `snap.mp3` played on every square click including the ones
> that placed nothing, so the sound meaning "that worked" also meant "that did not" — worse than
> silence, because the player learns to distrust it. Sound now follows the outcome, and one `Audio`
> element per sound is reused instead of one allocated per click. Haptics: 10ms on a placement,
> 25ms on a refusal and on a win.
>
> **A removal sounds like a placement, deliberately.** `feedbackFor('removed')` routes to the same
> acceptance feedback, which reads at first glance like the defect above coming back. It is not:
> `snap.mp3` here means "the board did what you asked", which is true of taking a piece back and
> was never true of the refused clicks that used to play it. Answering a removal with silence would
> make it feel like precisely the missed tap this section exists to distinguish. The function is
> named `acceptedFeedback` rather than `placedFeedback` so the routing and the name agree, and the
> decision is pinned by a test so it cannot be "tidied" into silence without someone choosing to.
>
> **Feedback is per puzzle, not per component.** `ClientBoard` is never remounted when the player
> changes level or difficulty — `DominoClient` renders it with no `key` — so its prop becomes a
> different `PuzzleSession` while the refs tracking "has anything happened since I last looked"
> survive. Sessions are cached and keep their own counters, so comparing bare numbers across that
> switch compares one puzzle's history against another's. Measured before the fix: placing a domino
> on level 1 and switching to an untouched level 2 fired a rejection buzz on a board that had never
> refused anything, and a shake in flight carried onto the next puzzle through the shared animation
> controls. Each watcher now remembers *which session* it was counting, adopts a new session's
> counters without producing feedback, and stops any shake still running. Adoption is not muting:
> the next thing the new board does is felt normally, which is itself asserted.
>
> **Check and hint are deferred to P1-6 (row 18), where the solver is built.** Not cut: the feature
> is wanted. But the caveat above is the whole reason — they need a solver with a defined contract,
> a node budget and a timeout behaviour, and the only solver in the repository is `e2e/solve.ts`,
> which is test-only by construction: no budget worth the name, no answer for an unsolvable
> position, and written for an *empty* board where a solution is known to exist. Promoting it would
> be exactly the "cheap because boards are single-solution" mistake this section warns against.
> Row 18 builds the real one; check and hint land on top of it there.

**P1-6. Content (promoted from P2 — for a daily puzzle this is the product, not infrastructure).**
Move `DominoBoard` into `scripts/generate-boards.ts`. **Fix the output contract first** (D10-j) —
emit comma-joined sums and repair `allow0Lines`, or the generator ships uncompletable boards.
Replace enumerate-every-solution with a search that **aborts on the second solution**.

**The solver (18b).** It lives in `app/stores/solver.ts` because check and hint (18e) are
player-facing; `e2e/solve.ts` stays where it is and is not promoted. The contract is a
discriminated union, and the rule behind it is that *a result is only as strong as what was
actually proven*:

| result | meaning |
|---|---|
| `solved` | exactly one completion, proven by exhausting the space |
| `multiple` | at least two, returned the moment the second is found |
| `unsolvable` | no completion, proven by exhausting the space |
| `budget-exhausted` | **unknown.** `solutionsFound` distinguishes "found one, uniqueness unsettled" from "found nothing" |
| `invalid` | not a position at all: `shape`, `cell-value`, `rocks`, `pairing`, `targets` |

Three boundaries are load-bearing. **`budget-exhausted` outranks a single solution** — finding
one completion and running out of budget is not `solved`, because the generator would ship an
ambiguous board and a hint would tell the player they are finished when they may not be.
**`unsolvable` is a verdict about a legal position**, not a complaint about the input; a board
whose line is already over its target is lost, not corrupt, and telling the player their save
is broken would be wrong. And **an invalid *budget* throws `RangeError`** rather than
returning `invalid`, matching the generator's configuration-versus-search distinction above.

A node is one visit to a search state, counted on entry, and the budget is an exact ceiling:
a search needing N nodes succeeds at `budget: N` and is exhausted at `N - 1`; `budget: 0`
visits nothing. Node counts are reproducible because the branch order is fixed — first empty
cell in row-major order, vertical before horizontal.

Every shipped puzzle is solved by this solver, by `tests/corpus.test.ts`, within
`DEFAULT_NODE_BUDGET` and with an order of magnitude to spare — the most expensive is about a
thousand nodes. Without that test the "comfortably above every shipped board" claim would rot
silently: a puzzle needing more would start returning `budget-exhausted`, check and hint would
go vague, and nothing would fail.

**Two budgets, bounding two different searches.** The generator asks the solver for
uniqueness instead of counting every solution, and a candidate whose check comes back
`budget-exhausted` is **discarded rather than emitted**. But `solverBudget` bounds only the
*uniqueness proof*. Finding candidates to put to that proof is unbounded work of its own, and
laziness is not a bound — it helps only when an early candidate is accepted, and does nothing
for a layout whose early candidates are all rejected, or one that cannot be tiled at all and
so explores its whole tree while yielding nothing to be lazy about (measured on empty
untileable boards: 5×5 1ms, 7×7 213ms, climbing). So the candidate search carries its own
`tilingBudget`, per rock layout; when it runs out the layout is abandoned and the next attempt
begins. A cap on completed candidates would not do, since the untileable case completes none.

`attempts`, `tilingBudget` and `solverBudget` together are what make generation finite, which
is what 18c's unattended corpus run leans on. All three are validated **eagerly**, before the
attempt loop: `generateBoard({ attempts: 0, solverBudget: -1 })` used to return `null`,
because the only check lived inside `solve` and the loop never called it. Whether a
configuration error is reported must not depend on how far the search happens to get.

The generator must also **terminate for every input**, which the original did not: rocks were
placed by drawing a cell and retrying when it was taken, so more rocks than cells — or an RNG
that kept returning the same cell — spun forever. `attempts` did not cover this, because it
bounds the outer loop and the spin is inside it. Placement draws without replacement instead.
Two failure modes are kept distinct: an impossible **configuration** throws `RangeError`,
because no retry could ever help; a valid request whose **search** came up empty returns
`null`, which is worth retrying with another seed. This matters most at 18c, which generates
thousands of boards unattended.

The impossible set includes the rock count itself, and that boundary is easy to get wrong in
both directions:

- `rocks > size²`, a fractional or negative size, rock count or attempt count.
- **An odd number of playable cells.** A domino covers two, so `size² - rocks` must be even.
  A 3×3 with no rocks leaves nine and can never be tiled; reporting that as `null` invites a
  caller to retry forever.
- **Fewer than two playable cells.** At `rocks === size²` every downstream check waves the
  board through — `rocksArePlayable` skips rock cells and finds nothing to object to, and
  `firstEmpty` returns `null` at once so the empty tiling counts as one solution — and the
  generator emits an all-rock puzzle with all-zero targets that the player finds already
  complete without making a move.

The playable-cell rule belongs to `generateBoard`, not to the placement primitive:
`scatterRocks` is a sampler, and rocking out every cell is a legitimate thing to ask it for.

**Pick the content strategy explicitly** — "a new puzzle every day indefinitely" with no backend
and no runtime generation is not satisfiable by a finite JSON bundle, and the draft asserted all
three at once. The options, in order of preference:

1. **Pre-generate a fixed horizon (recommended): 10 years ≈ 3,650 day-entries × 9 boards.**
   **Chosen and implemented in 18c** — see "The pipeline" below for what it actually measured,
   which is close to this estimate. Projection from the current file (2 day-entries, 9 boards
   each):

   | encoding | per day | 1 year | 10 years | monthly chunk |
   |---|---|---|---|---|
   | pretty JSON (as committed today) | 10.8 KB | 3.9 MB | **39 MB** | 325 KB |
   | minified | 3.1 KB | 1.1 MB | 10.8 MB | 91 KB |
   | brotli over the wire | 291 B | 0.1 MB | **1.0 MB** | **9 KB** |

   So the horizon is cheap over the wire but must **not** be a bundled `import` — 10.8 MB of
   minified JSON in the JS graph is disqualifying. Serve it as static, content-hashed assets
   chunked by month and fetched on demand: ~9 KB brotli per chunk. (An earlier draft's "a few MB"
   was wrong; so was a 33–40 MB figure, which measured the pretty-printed encoding.) Commit the
   generator's output minified. Add a CI job that fails when fewer than 12 months of content
   remain.
2. Deterministic seeded generation in the client from a day seed — removes the horizon entirely,
   but requires the single-solution search to run in milliseconds in a browser, which the current
   exponential algorithm cannot do. Only viable after the generator is rewritten.
3. A scheduled job publishing new packs. Lowest ceiling on effort, but reintroduces infrastructure.

**The archive needs stable identity, which modulo rotation cannot provide.** `daysSinceEpoch % 2`
is a rotation, not a mapping: it gives no permanent date→puzzle relation and re-serves the same
content under different dates. Replace it with an explicit, append-only date→`puzzleId` index.
**Done in 18d**: `getCurrentActiveBoard` and its modulus are gone, and with them the Server
Action — the lookup is a fetch of one published month in the browser.

### The pipeline (18c)

`scripts/corpus.ts` holds the rules and is pure; `corpus-io.ts` does the filesystem;
`build-corpus.ts`, `verify-corpus.ts` and `check-horizon.ts` are the three entry points
(`npm run corpus:build` / `:verify` / `:horizon`), and `args.ts` parses their command lines.
TypeScript scripts run under `tsx`, added as a dev dependency — Node's own type stripping
needs explicit `.ts` extensions on every import, which would have meant rewriting
app-internal imports for the benefit of a script.

**Arguments are configuration, so a wrong one fails immediately**, the same way an
impossible generator request throws rather than searching. Each script used to find its
options with `process.argv.indexOf('--out')` and take whatever sat next to it, which is
permissive three ways: `--out ""` passed every check, generated a whole corpus and then
died on `mkdir ''` — after the work, in the one script whose entire shape is
validate-then-write; `--out --months 3` would have written the corpus to a directory called
`--months`; and `--monts 3` matched nothing, so the typo quietly ran the default 120-month
build. The parser now rejects unknown options, repeated options, missing, empty and
option-shaped values, and bare arguments, and names what would have worked. Underneath it,
`assertSafeTarget` refuses the empty path outright rather than letting `readdir('')`'s
ENOENT read as "does not exist yet, it will be created".

**Reproducible.** Every puzzle is a pure function of `(CORPUS_VERSION, CORPUS_SEED, date,
slot)`, hashed with FNV-1a into an xorshift32 stream. Two rebuilds produce byte-identical
chunks, so a content diff is always deliberate. The seed folds in all four parts rather than
adding them, which is what stops `(day 2, level 3)` and `(day 3, level 2)` sharing a stream
and repeating puzzles along a diagonal.

**Append-only.** A published date is a promise — saved progress, the archive, and the
player's memory of yesterday all point at it. The build reads the committed index and
refuses to write if any published date has changed, disappeared, or been renamed; asking for
fewer months than are already published extends rather than truncates. Puzzle ids are
`v1-YYYY-MM-DD-<difficulty>-<level>`, derived from what they point at rather than from a
position in a file — the old `v1-000-easy-1` scheme would have re-pointed every saved session
if a day were ever inserted.

**Distinct, not merely valid.** "Exactly one solution" is not the same as "a new puzzle".
The first corpus built here was structurally perfect and contained **314 exact repeats**
among 32,877 entries — 297 easy, 17 medium, none hard — the closest pair four days apart. A
player meeting the same board twice in a week reads that as the game being broken. Generation
now carries the set of definitions already emitted and re-rolls a slot onto a different seed
when it would repeat one, comparing the **full canonical definition** rather than the 32-bit
`definitionHash`, which would itself collide by birthday across this many entries. The
re-roll is folded into the seed only when non-zero, so puzzles that never collided are
untouched and a corpus diff shows only what actually changed. `duplicateDefinitions` is then
run over the finished corpus as a separate check, by both the build and `corpus:verify`.

**Validated before it replaces anything.** Structure, chunk hashes, every manifest field
against one derived from the chunk itself, slot sizes and rock counts, date contiguity across
chunk boundaries, id uniqueness, repetition, and then **every puzzle through the production
solver** — once each, not, as the first version did, three times over.

**Committed atomically**, by the transaction the content-addressed design already provides
rather than by a directory swap. The first version did `rm(dir, { recursive: true })` then
`rename(staging, dir)`, which leaves no corpus at all in between — and cannot be fixed by
reordering, because renaming a directory over a non-empty one fails with `EPERM` on Windows
(measured). It could also be pointed at `public` or at the repository root and would delete
either.

A chunk's filename carries the first 64 bits of the hash of its bytes, so a new chunk is
overwhelmingly unlikely to collide with a live one — collision-*resistant*, not
collision-free, which is why the manifest carries the full SHA-256 and that is what every
check compares against. New chunks are therefore written alongside the old ones; the
manifest decides which files constitute the corpus, and replacing a single *file* by rename
is atomic even on Windows. So: write the new chunks, write the manifest, read it back to
prove it landed intact, rename it over `index.json` — that rename is the commit — and only
then delete what nothing references. Interrupted anywhere before the rename, the previous
corpus is still complete and still readable; the cost is some unreferenced files, which
`orphanFiles` reports and the next successful build removes.

**Every file goes through a unique temporary name and is read back before being renamed**,
so a name asserting a content hash is never created for bytes that do not hash to it. And an
existing chunk is **re-hashed rather than trusted**: a process killed mid-write used to leave
a truncated file under its final name, and the next build skipped it on sight of the filename
and committed a manifest pointing at the wreckage — *reporting success*, with the corruption
surfacing only at read time, later, somewhere else. A filename is not evidence about bytes,
and 64 bits of digest would not be much evidence even if it were.

**Writes are serialised by a lock**, because unique temporary names prevent two builds
clobbering each other's scratch and do nothing about the race that matters — two builds
committing manifests. A 122-month build can commit and then be replaced by a 121-month one
that started earlier and finished later, and the corpus silently goes backwards.

The lock is a **directory**, created with `mkdir`, and an **owner record published inside it
by rename**. It was first a file created with `writeFile(..., { flag: 'wx' })`, which is
exclusive but not atomic in the sense that matters: it opens the file and *then* writes it,
and in between the lock exists and is empty. A second build reading it there got `''`,
parsed `{}`, found no live pid, concluded the lock was stale and deleted a live holder's
lock. Measured with a separate process reading the lock as fast as it could while this one
created it: **7,787 of 22,920 observations saw it empty** — so a colliding build stole a live
lock about a third of the time. `mkdir` has no such window, and the record inside goes
through the same temp-and-rename as every other file, so it is never visible
half-written: measured the same way, **zero empty and zero malformed records in 173,544
observations across 2,402 acquisitions** — only complete or absent.

A lock that names a **live** process is reported, not stolen, however old it is. One that
names a **dead** one is broken immediately, since otherwise a crash would need a human
before any build could run again. One that names **nobody** — missing or malformed — is the
ambiguous case, and only its age separates a holder that took it microseconds ago from a
build that died inside that window: under ten seconds it is busy, over ten seconds it is
wreckage. Guessing "stale" is the dangerous guess, because it evicts a live writer, so the
young end of that rule errs towards waiting.

Each acquisition also carries an **unguessable token**, and the release removes the lock only
while the token still matches. A pid is not enough: pids are reused, and the failure this
guards against is our lock being removed externally and another build legitimately taking
one, at which point an unconditional `rm` would evict a build that has done nothing wrong.
This narrows the window rather than closing it — closing it needs an atomic
compare-and-delete, which the filesystem does not offer.

**The output directory is refused before generation** unless everything in it belongs to this
pipeline — and belonging is *proved*, not assumed: a chunk-named file must hash to the name
it claims. A directory holding `2026-09.deadbeefdeadbeef.json` full of unrelated bytes was
previously accepted on the strength of the filename alone. Recovery state from an interrupted
run — a manifest, a lock, this module's own temporaries — is recognised rather than treated as
foreign; classifying an abandoned temporary as a stranger made every subsequent build refuse,
permanently, which turned the recovery story into a recovery blocker. A badly-hashing chunk is
this pipeline's wreckage when it sits alongside such evidence and may be overwritten; alone in
a directory it is indistinguishable from someone else's file, and nothing here will delete
it.

`readCorpus` treats only a missing manifest as "no corpus". Every other failure propagates:
a permissions error read as absence would leave the append-only check with nothing to
compare against, and it is the only thing standing between a rebuild and ten years of
overwritten content.

**Out of the JS import graph.** `public/puzzles/`, fetched as static assets, never imported.
Chunk filenames carry a content hash (`2026-09.96fc740c71f810c0.json`) so they can be cached
indefinitely and a changed chunk is a different URL; the manifest carries the full SHA-256 so
a corrupted or swapped chunk is detectable rather than merely wrong.

**Measured, not projected** (3,653 days, 32,877 puzzles, to 2036-08-31):

| | |
|---|---|
| generation | 359s (6min) |
| solver verification of all 32,877 | 0.7s |
| on disk, minified | 12.00 MB |
| gzip | 0.86 MB |
| brotli | 0.71 MB |
| largest single chunk | 104.3 KB raw, **6.2 KB brotli** |

So a client fetches one month at a time and pays single-digit kilobytes for it, which is what
the chunking is for. The repository carries the uncompressed cost, which is the deliberate
trade: no backend, no runtime generation.

**The horizon guard** (`.github/workflows/corpus-horizon.yml`) is measured from the **last
indexed date**, never from a count of files — a count cannot distinguish ten years of runway
from ten years of history. It is scheduled monthly rather than only run on push, because
nothing about a commit shrinks the horizon; time does.

It validates the corpus first and takes that date from the **last chunk**, not from
`manifest.lastDate`. Reading the field directly was a real hole: `readCorpus` verifies every
chunk's hash, but nothing tied the manifest's summary to the chunks, so editing one line of
`index.json` would have kept the guard green for years with no extra content behind it. A
guard that can be silenced by editing the thing it guards is not a guard. An unparseable
`--today` is rejected rather than subtracted into `NaN months left` with a zero exit.

The workflow runs `corpus:verify` before the guard, since this repository still has no
general CI pipeline (D10-s — that remains P2) and a corpus change would otherwise reach the
branch with nothing having solved any of its puzzles.

**P1-7. Persist progress.** `{board, completed, elapsedMs}` under a versioned namespace, keyed by
the **`puzzleId`** from P0-5 — one identity across cache, persistence and archive — with the
stored record carrying the `definitionHash` so a changed puzzle invalidates its session instead of
silently loading mismatched state. **Reuse the server-safe pattern P0-1 established in
`app/hooks/useLocalStorage.ts`** — initialise from a default, hydrate in a `useEffect`, never read
during render, wrap every access in `try/catch` — rather than reaching for storage directly.
Migrate or discard on version mismatch. Sequence carefully against P0-5: cloning on ingest will destroy in-progress
boards unless the Map is populated first.

> **Implemented in row 17, except `elapsedMs` — which is cut from this row, not silently
> dropped.** There is no clock anywhere in the product: nothing counts play time, nothing
> displays it, and nothing reads it. Persisting the field would mean inventing its semantics
> — does it run while the tab is hidden? from the first move or from mount? does it stop at
> completion? — with no feature to check the answers against, and then storing a number no
> reader would use. It belongs with whatever first needs it (stats, or the archive in P1-6),
> where the questions have answers. `{board, completed}` is what row 17 saves.
>
> **The shape: one key per puzzle**, `dominoFill.progress.v2.<puzzleId>`, each record carrying
> its `definitionHash` and an absolute `savedAt`. This is a reversal of the first design, which
> kept a single document, and the reason is other tabs — see the multi-tab note below. The
> version is in the key, so a rollback cannot read forward data.
>
> **The v1 migration is failure-safe, which decides its order.** It parses and validates the
> whole document *before* deleting anything, treats an existing v2 record as authoritative and
> never writes over it, and removes the old key only once every entry that still matters is
> safely across. A refused write leaves the document in place for the next load to finish; a
> document that is not a v1 document at all is retired, since there is nothing in it to lose.
> An entry already past the retention window is discarded rather than copied, and deliberately
> does not count as a write that must succeed — otherwise a document of nothing but abandoned
> boards could never be removed under quota pressure, while occupying the quota that was
> refusing the writes. What the migration read is also returned, so the boards can be restored
> in memory for the session even when storage will not accept them.
>
> Migrating has to invent an instant, because v1 recorded only a day. It uses the **latest
> instant that date could have been anywhere on earth** — its end in UTC−12 — so a record is
> never treated as older than it was and migrating can never bring an expiry forward. The
> obvious reading, "the end of that day here", is wrong: `savedOn` carries no timezone, so it
> reconstructs the day in the *reader's* zone, and the extremes are twenty-six hours apart.
> The cost of the conservative bound is at most about twenty-six hours on a fourteen-day
> window.
>
> **A saved board is not trusted because it is saved.** Storage outlives upgrades and is
> editable from a console, so `progressFor` refuses anything that is not a position the rules
> could have produced. It checks the `definitionHash`, the size, and that the rocks sit where
> the definition says; that every cell holds a rock or one of the three pip values, so a
> planted `99` cannot be restored and counted into a line sum; that every placed half belongs
> to **exactly one** well-formed domino, which rejects both an orphan half and a `0` claimed by
> two dominoes at once; and that a `completed: true` record really is a full board matching its
> targets — otherwise a hand-edited flag would restore an `inert` puzzle that can be neither
> played nor finished, which is P1-3's soft-lock coming back in through storage. Corrupt
> records are dropped one at a time, so one bad puzzle costs that puzzle rather than the other
> eight.
>
> **Retention measures age, not the calendar.** A record untouched for 14 days goes, and
> `savedAt` means "when this puzzle last moved" rather than "when the app was last open" —
> restamping on every write would put the window out of reach of anyone who plays daily. It is
> an absolute instant rather than a local day string, and that matters more than it sounds:
> the first version compared day strings and dropped anything dated *later* than today, so a
> player flying west across the date line had that day's progress deleted — by the rollover
> check, which exists precisely to notice a backward date change. Ageing is now one-directional:
> a future stamp is kept, trading a few kilobytes against somebody's half-finished board.
>
> **Day rollover.** The board was fetched once in a mount effect and never again, so a tab
> left open overnight served yesterday's puzzle indefinitely — the ordinary case for a daily
> game on a phone, where the tab is backgrounded rather than closed. `useDayRollover` compares
> the *local calendar day* on visibility, on focus and on a poll; a timer set for the next
> midnight would assume the clock runs forward at one second per second, which is false across
> sleep, a timezone change and a manual correction. A failed refetch is swallowed: the player
> has a working board on screen, and taking it away because a background refresh missed would
> be worse than being a day stale.
>
> **D10-i's remainder is closed.** Initial selection lands on the first *unsolved* puzzle,
> which needed persisted completion before it could mean anything. It re-selects only when the
> puzzle under the player actually changed, so a refetch of the same day never moves someone
> mid-board.
>
> **Two tabs.** A single shared document could not be made safe by care alone. Writing only
> locally-changed records fixed the *sequential* case — a tab writing back a stale snapshot —
> but not the interleaved one: two tabs read the same document, both write it whole, and the
> second erases the first, on a puzzle neither was editing. `setItem` is atomic; the
> read-modify-write around it is not, and the HTML standard is explicit that authors must not
> assume locking between agent clusters. So the layout changed instead: one key per puzzle
> means a save never rewrites another puzzle, and that class of loss stops existing rather than
> being narrowed. A lock (Web Locks) or a transactional store (IndexedDB) would be the other
> route, and both are heavier than a problem that a key naming scheme removes outright.
>
> Two tabs playing *the same* puzzle still resolve last-write-wins, deliberately: there is no
> honest merge of "these two dominoes were placed in different places", and the alternative is
> asking a player which of their own boards to throw away.
>
> **Rollover used to swap an unfinished board. Closed in row 18d.** When the served ids
> changed, the new pack was selected and the previous unfinished puzzle became unreachable
> — its *progress* was safe (the record is kept for the retention window and the session is
> dropped only from memory), but there was no way back to it. Closing it needed somewhere to
> go, which is the archive; see "The runtime (18d)" below for the rule that replaced it.
>
> **Note on the test environment, not on the product.** Node 25 defines its own `localStorage`
> global that shadows jsdom's and has *no working methods* — probed: `getItem`, `setItem`,
> `clear` and `length` are all undefined. Every unit test of persistence therefore runs against
> an in-memory double installed in `tests/setup.ts`, and `e2e/persistence.spec.ts` is the only
> place the feature meets a real browser store. The production guards feature-check the method
> rather than the object, which is exactly why this environment fails closed instead of
> throwing.

### The runtime (18d)

**One chunk, fetched, not imported.** `app/stores/corpusSource.ts` reads `index.json`, finds
the month, and fetches that one file. Bundling the corpus would put 10.8 MB of minified JSON
in the JavaScript graph to serve one day of it; as static assets it is ~4 KB for the index
and ~6 KB brotli for a month. Chunk filenames carry a content hash, so they are immutable
and cache forever — only `index.json` is ever refetched. An E2E test reads every script tag
the page actually loads and fails if chunk content is in any of them, because an accidental
`import` would pass every other test here.

The shape of both documents is checked but not their hashes. Over HTTPS the bytes are
already protected in transit; what this actually guards against is a stale deploy or a proxy
answering 200 with an error page, and asking whether the document says what it should catches
that at least as well as a digest would.

Caching is **per-promise, not per-result**, so two callers arriving together share one
request — and the cache entry is installed in the same synchronous turn as the miss that
found it. An `async` version that awaited the manifest first let three concurrent callers all
pass the cache check before any of them filled it, and fetched the month three times;
measured by the test that counts requests. A *rejected* promise is evicted, so one bad moment
at startup is not remembered for the life of the tab — which matters because
`useDayRollover`'s retry assumes exactly that.

**Hashed chunks are cached the way their names promise.** Measured, because the claim was
false: `next start` serves everything under `public/` as `Cache-Control: public, max-age=0`,
so the browser revalidated a 104 KB immutable file on every load and the content hash in the
filename bought nothing. A hashed name does not change Next's `public/` policy on its own.
`next.config.ts` now pins `YYYY-MM.<16 hex>.json` for a year as `immutable` — different
content means a different name, so the bytes can never change — while `index.json`, the one
file that is rewritten whenever the corpus is extended, stays revalidatable. Both are checked
against the production server in an E2E test.

**A clock outside the corpus is clamped, the clamp is reported, and the report is used.** A
device can be years wrong, and a playable board beats an error page; silently serving some
other day's puzzle would break the one promise the date index makes, so `loadDay` returns
the requested date alongside the served one. The store then keeps *both*: `today` is the day
that can actually be served and bounds everything downstream, while `deviceToday` and
`clockClamp` are what let the screen say what happened.

Carrying only the clock's own date broke it at both ends. Past the corpus, "am I on today"
was false forever, so the banner offered a "Play today" whose entire effect was to refetch
the board already on screen, and the archive would page forward into months holding nothing.
Before the corpus, every published day was in the future, so the archive offered no days at
all — not even the one being played at that moment.

**A new day is offered, not imposed.** This is P1-7's rollover obligation. `receiveDay`
decides whether a day may replace what is on screen; `setDay` obeys. A day is **held back**
when the board on screen is unfinished *and has moves on it*, or when the player is standing
on a date they chose from the archive. Everything the player asks for goes through `setDay`,
because the rule protects them from the clock and not from themselves.

"Under an active player" is read narrowly and deliberately: the board they are *looking at*.
The wider reading — hold the day back if any of the day's nine is half-played — was rejected,
because a level abandoned half-done would then interpose a prompt every morning forever, and
what it would be protecting is already safe: the progress is stored and the archive can reach
it. What cannot be undone is taking a board away mid-move.

A refetch of the day already on screen is *not* a swap and is always applied — otherwise a
rollover whose first attempt failed would have its retry refused as if it were news.

**The archive** lists every published day up to today, a month at a time. Days after today
exist as files and are never offered: handing out tomorrow's puzzle is the one thing a daily
game must not do. A day's completion mark is looked up from the **ids in the chunk**, never
by parsing a date out of a `puzzleId` — that derivation is exactly how content identity and
state identity re-entangle, and the month is fetched anyway, so the real ids are already to
hand.

A mark is also **checked, not believed**. The first version read the raw records and trusted
`record.completed`, which is a different claim from the one the rest of the app makes:
everywhere else a record must pass `progressFor` — hash, size, rock positions, every placed
half part of exactly one well-formed domino, and a `completed: true` record actually being a
full board that matches its targets — and retention is applied where the answer is used,
because `pruneStorage` can be refused. Without those, a day showed as finished because a flag
was edited in a console, and as played because a record that aged out three weeks ago could
not be deleted under quota pressure. `markForDay` applies both. The panel is mounted only while it is open, which is what lets the records and the
starting month be initial state instead of an effect, and means a player who never opens it
fetches none of it.

**P1-8. Accessibility.** Real `<button>`s for `LevelSelector` and `DominoPieces`; `aria-pressed` /
`role="radiogroup"` on the difficulty slider. If `role="grid"` is used it needs `role="row"`
children and a **roving tabindex** (container `tabIndex={0}`, focused cell `0`, rest `-1`) — 64
focusable cells is otherwise 64 tab stops; a `role="group"` of labelled buttons is the simpler
option. `<MotionConfig reducedMotion="user">` at the root covers every animation in one line.

> **Implemented in row 19.** Every claim below was measured in Chrome's computed
> accessibility tree before anything was changed, because the attribute and what reaches a
> screen reader are not the same thing — and here they differed in three places.
>
> **The board's `role="grid"` was empty.** Not partially implemented: the whole 6x6
> computed to `grid "Domino board": img × 8` — eight unnamed pictures for the pieces on
> it and **not one of the thirty-six squares**. The role promises a table to navigate and
> delivered nothing. Cells are now `role="gridcell"`, named "Row 3, column 4, empty" and so
> on, inside `role="row"` wrappers, with `aria-rowcount`/`aria-colcount` on the grid.
>
> The rows are `display: contents`, since the cells must stay direct children of the CSS
> grid for `grid-template-columns` to apply to them. That property has a reputation for
> dropping elements out of the accessibility tree, so it was probed before it was used: in
> this browser the tree came back `grid > row > gridcell` complete, with the cells still
> laid out in their columns.
>
> **Amendment — the roving tabindex is one stop, not two.** The sketch above leaves the
> container tabbable alongside the focused cell, and since the container comes first in
> document order that is two stops for one board. The container takes `-1`, always, and a
> cell owns the stop; `-1` keeps the grid programmatically focusable, which `.focus()` on
> it still relies on.
>
> The first attempt at this only handed the stop over *once a cell was focused*, which
> fixed the case after the first arrow key and left the untouched board with both —
> measured cold: `{ gridTabIndex: 0, cellsWithZero: ["0,0"], total: 2 }`. It had a second
> consequence a player would actually feel. Tab landed on the grid, so `focusedCell` stayed
> null, and the store spends the first arrow key initialising it (*entering the board is
> itself the action*): tab in, press Right, and you are on `0,0`; press Right again and
> only then do you reach `0,1`. A keypress that visibly does nothing reads as a broken
> board.
>
> Both are fixed by a cell telling the store when it takes focus, so arriving somewhere
> *is* being there. The tests that missed this missed it for instructive reasons — the
> count looked only at `[data-cell]`, which excludes the grid, and the stronger check ran
> only after an arrow key had already moved the stop — so the replacements count the grid
> together with its cells from a cold page, and enter the board through real Tab presses
> rather than `.focus()`, which is what hid the problem.
>
> One knock-on worth stating: the focus ring now follows real DOM focus, so clicking a
> square shows it, where before row 19 it appeared only once the keyboard had been used.
> The highlight and the browser can no longer disagree about where the keyboard is.
>
> Moving DOM focus with the arrow keys — rather than only moving a highlight — is what
> makes each square announce itself, with no live region in the loop. It also introduced
> the row's one real hazard: React's `onBlur` is `focusout`, which bubbles, so focus moving
> between two cells fires it on the grid, whose handler cancels the gesture. Removing the
> containment guard and running the suite **failed nineteen tests** across board,
> completion, feedback, persistence and undo — every placement that moved focus was
> cancelling the gesture that was making it. The guard was written from reasoning, and then
> kept because measurement contradicted the follow-up reasoning that called it merely
> defensive.
>
> **The level arrows were unreachable**, which P1-5's source had already recorded as the
> pile new controls should not join. Measured, the page's entire tab order was Easy,
> Medium, Hard, the board, Check, Hint, Reset, Archive: a keyboard could reach every
> control in the game except the one that changes which puzzle you play. They are real
> buttons now, and `disabled` at the ends of the range rather than merely greyed by a CSS
> filter over a handler that silently did nothing.
>
> They name their **destination** — "Go to puzzle 2 of 3" — and the group carries the
> position, "Puzzle 1 of 3". The first attempt named them "Next puzzle, 1 of 3", where the
> number means where you are but reads as where you are going, so the button that takes
> you to puzzle 2 announces the number 1. A button's name should answer "what happens if I
> press this"; context about the set belongs on the group, which is where a screen reader
> looks for it. The destination is clamped, so a disabled arrow names the puzzle you are
> already on rather than a puzzle 0 or 4.
>
> **Difficulty had no state at all** — three buttons, no `aria-pressed`, the current one
> distinguished only by `background-color`. `aria-pressed` rather than `role="radiogroup"`:
> the spec offers either, and pressed buttons leave the keyboard contract of three working
> controls alone where a radio group would take over the arrow keys. The selected button
> also gets a ring and bold text, for the reason D10-g gave for the line labels.
>
> **Amendment — `DominoPieces` gets `role="img"`, not `<button>`.** This item was written
> when the tray was a mode selector; P1-1 made it a legend, and a button that selects
> nothing is a worse control than no control. The defect underneath was real and is fixed:
> `aria-label` on a role-less `div` is not exposed, so both entries reached the tree as
> bare unnamed `img` nodes and their explanations were being written and then dropped.
>
> **The decorative piece layer was still in the tree.** `pointer-events: none` and the
> comment calling it decorative were both about the pointer; the accessibility tree had
> never been asked. Those SVGs were the eight unnamed `img` nodes in the measurement above,
> and naming the cells did not remove them — it left the noise alongside the signal, so a
> screen reader walking the board still met a run of anonymous images that say nothing
> about which square they are on. The layer is `aria-hidden` now, which loses nothing,
> because the same information is on the cell underneath and comes with coordinates.
>
> **The same defect, found twice more.** The row and column targets carry `labelDescription`
> for exactly this reason — strikethrough and colour reach no screen reader — and the
> whole strip computed to one anonymous text run, `3 2 2 2 3 2 3 3 2 2 4 0`, with every
> description discarded. They now have a role that supports naming, and they say which line
> they are: "Row 3, target 7, complete" rather than "7, complete", because these labels sit
> outside the grid and nothing else identifies them.
>
> **Nothing honoured `prefers-reduced-motion`** — searched for across every component and
> stylesheet, and absent — while the board shakes on a refusal, the arrows scale, the
> labels tween and the completion card animates in. `<MotionConfig reducedMotion="user">`
> sits at the client boundary in `provider.tsx`, the one wrapper every `motion` component
> in the tree is inside.
>
> **One shared vocabulary.** A square names a piece with the same words the hint does,
> checked by a test that compares the two real strings. They had already drifted by an
> article when the phrases were written twice, so they are written once.

**P1-9. Tests — Playwright, explicit and not optional.**

> **Carried in from P0-9a:** add a **360×640 tutorial check** — no horizontal overflow, the
> modal's content scrolls when it is taller than the viewport, and **Skip stays reachable**.
> jsdom cannot verify any of the three, so the tutorial's escape hatch is currently unproven
> on a phone-sized screen.

jsdom has no layout, so
  `getBoundingClientRect()` returns zeros and it **cannot** verify label alignment, clipping,
  horizontal overflow, duplicate taps from compat `click`, pointer-overlay hit regions, or the
  tutorial at phone sizes — i.e. most of D3, D4, D9 and every layout acceptance criterion. Those
  need a real browser with device emulation. Generator tests (exactly one solution, no walled-off
  cell, **and round-trip through the runtime parser**) stay in Vitest and land with P1-6.

### P2 — polish

**P2-1. Delete dead code.** `SkibidiBoard.ts`, `constants.ts`, the duplicate
`app/dominoFill/page.tsx`, the unawaited-Promise work in `app/page.tsx`, and the commented-out
blocks that outnumber live code in `BoardsStore.ts` and `BoardSquare.tsx`. Fix `Boards.ts`'s
`"use server"` export (D10-d) and SSR the board as a prop (D10-c).

**P2-2. Metadata/PWA.** Real title/description/OG, `viewport` export with `viewportFit: 'cover'` +
safe-area insets and `userScalable` left **enabled** (do not "fix" zoom by banning it), manifest,
apple-touch icons. Note Next 16 already injects a sane default viewport meta, so the 300ms tap
delay is not a live problem. Sequence behind P1-6 — installability is retention polish, and there
is nothing to retain a player with until the content exists.

**P2-3. Theming.** Implement a real dark palette or drop the `prefers-color-scheme` block; the
current half-state is worse than either.

**P2-4. Audio.** One preloaded element per sound (or swap `src` on one), absolute `/snap.mp3`
paths, `.catch(() => {})` on every `play()`, a persisted mute toggle, and snap only on *accepted*
placements. **iOS unlocks audio elements individually, not globally** — `winSilent.mp3` is
constructed at import and never played inside a gesture, so its first `play()` can be rejected even
though `snap.mp3` works. Unlock the pool on first `pointerdown`. This also means P1-4's completion
overlay must not move the win `play()` behind a `setTimeout`, debounce, or transition.

---

## 4. Sequencing

Each row is a distinct, independently testable change. No item appears twice; nothing is bundled
that can be verified separately. (Earlier drafts scheduled several P0 items twice and lumped the
whole of P0 into one oversized set.)

| # | Change | Lands with |
|---|---|---|
| 1 | **P0-1** build fix — delete the dead `LevelStore` field; make `useLocalhost` server-safe | manual `next build` |
| 2 | **P0-10** Vitest harness + `test` script; characterise *existing* rules only | — |
| 3 | **P0-2** construct the store in the provider; move `StoreWrapper` inside `<body>` | unit |
| 4 | **P0-5** `puzzleId` (+ interim IDs for the existing 18) + puzzle/session split + store Map | unit |
| 5 | **P0-7** guard `removePiece` | unit (corrected-behaviour tests land here) |
| 6 | **P0-6** de-duplicate the win check; board-full assertion; resolve D10-d2 naming | unit |
| 7 | **P0-8** hover state onto `CurrentBoardStore`; clear on leave | unit |
| 8 | **P0-9a** tutorial: rule text, skip button, `fixed inset-0`, sizing | unit + manual |
| 9 | **P1-9** Playwright harness + `test:e2e` script (incl. the tutorial check below) | — |
| 10 | **P0-4** piece-overlay hit regions (+ `data-cell`/`data-piece` test hooks, see P1-2 note) | E2E |
| 11 | **P0-3** responsive layout: gutter, `min-*: 0`, cell-derived font, shell formula, both-axis budget | E2E (geometry/alignment/overflow) |
| 12 | **P1-2** move hit-testing onto the cells (`CellHover`, `closest('[data-cell]')`) | E2E |
| 13 | **P1-1** unified verb: pointer drag, tap, keyboard — **with P0-9b** | E2E (touch context + keyboard) |
| 14 | **P1-3** undo + reset — **✅ done**; fixes D10-h and D10-i's restart half | unit (undo round-trip) + E2E (controls) |
| 15 | **P1-4** completion feedback — **✅ done**; closes P1-1's completion-focus clause and row 14's deferred browser win | unit + E2E (real win) |
| 16 | **P1-5** honest feedback; shake on reject — **✅ done**; fixes D10-f and D10-g. Check/hint **deferred to row 18**, where the solver contract is built | unit + E2E |
| 17 | **P1-7** persistence + day rollover — closes D10-i's remainder. `elapsedMs` **cut to a later row** (no clock exists to save); the unfinished-board rollover gap was its remaining hole and **row 18d closed it** | unit + E2E |
| 18a | **P1-6** generator contract — **✅ done**; fixes D10-j and D10-o. Generator moved to `scripts/`, comma-joined targets, numeric `allow0Lines`, round-trip through the production parser. Follow-ups: rock placement draws **without replacement** so the generator terminates for every input; an impossible *configuration* throws `RangeError` while a fruitless *search* returns `null`; and the playable-cell count is validated as even and ≥ 2, so neither an untileable board nor an already-complete all-rock one can be emitted | unit |
| 18b | **P1-6** solver contract — **✅ done**. `app/stores/solver.ts`: a discriminated result union (solved / multiple / unsolvable / budget-exhausted / invalid), an exact node budget, partially-played boards treated as fixed constraints and never mutated, uniqueness stopping at solution two. The generator’s exhaustive `solutionsByTargets` is replaced by it, and the candidate search it feeds carries a **separate** `tilingBudget`; all shipped puzzles are solver-verified by `tests/corpus.test.ts` | unit |
| 18c | **P1-6** content pipeline — **✅ done**. Ten-year horizon in monthly content-hashed chunks under `public/puzzles/`, out of the JS import graph; every puzzle a pure function of version/seed/date/slot; append-only enforced against the committed index; no repeated definitions; atomic manifest-rename commit with the previous corpus readable throughout; every puzzle solver-verified before anything is written; horizon guard derived from the last chunk | unit + CI |
| 18d | **P1-6** runtime loader + archive: load one chunk, explicit date index instead of modulo rotation, **and P1-7's rollover obligation** — an unfinished board stays reachable and is never silently swapped | unit + E2E |
| 18e | **P1-5's check/hint** — **✅ done**; built only on the production solver, honest about unsolvable versus budget-exhausted, mutating nothing and bypassing neither undo nor persistence | unit + E2E |
| 19 | **P1-8** accessibility — **✅ done**: the grid's cells reach assistive technology at all, one tab stop with focus that follows the arrow keys, the level arrows reachable and named, difficulty state carried in more than colour, three dropped `aria-label`s exposed, and `prefers-reduced-motion` honoured | unit + E2E |
| 20 | **P2** polish: dead code, metadata/PWA, theming, audio | — |

Rows 1–2 are the gate: nothing else starts until the build is green and the unit harness exists.
**Row 9 is placed before row 10 deliberately** — rows 10 and 11 are the first changes whose
verification is inherently E2E (hit regions, label alignment, overflow), so the Playwright harness
must precede them rather than trail them. Every row is independently revertible. The tutorial is
split across rows 8 and 13 so its known-wrong rule text and hard gate are gone early, while its
input instructions are written once, against the verb that actually shipped.

## 5. Acceptance criteria

**Build & correctness**
- `npm run build`, `npm run lint`, `npm test` (Vitest) and `npm run test:e2e` (Playwright) all
  pass — the latter two do not exist yet and are part of P0-10/P1-9. No `console.log` in shipped code.
- Clicking the bottom edge of an empty cell above a placed domino *places*, never deletes.
- A completed board can be reset; no state is reachable where the board is inert with no way out.

**Layout** — at 360×640, 390×844, 800×400 landscape, and at 50/100/150/200% desktop zoom:
- Every row/column label stays aligned with its row/column.
- Cells are **≥ 38 CSS px** on an 8×8 board at 360px wide, and the whole shell (gutter + border +
  grid) fits the viewport with its page margin.
- The page never scrolls horizontally, and no board content is clipped above a centred container.

> **Why 38px, and not the WCAG 44px target.** The governing formula is
> `(n + gutter)·cell + border ≤ viewport − margin`. With `n=8`, `gutter=0.7` cell (P0-3),
> `border=8px`, `margin=16px`: `8.7·cell ≤ 336` → **cell ≤ 38.6px**. 44px is unreachable — eight
> cells alone is 352px, and the 8px border exhausts the 360px viewport before any gutter exists.
> Successive drafts said 44 then 40; both were derived before the gutter fraction was pinned down,
> and neither survives the arithmetic. Anyone writing 44px into a test is writing a test that
> cannot pass. The mitigation is that P1-1's verb is a *drag toward a
> neighbour*, whose effective target is a cell plus a direction rather than a precise 44px tap
> point. If a literal 44px visual cell is ever required, the only ways out are overlaying the
> labels inside the board edge, or accepting controlled scrolling — both explicit design changes,
> not tuning.

**Play**
- A first-time player places a correct domino within 15 seconds without reading instructional text.
- Placement works by drag and by tap on a phone, with a live preview; no tap ever places two.
- Winning produces a visible celebration and a Next affordance within 500ms.
- Any single placement or removal is undoable.
- The tutorial can be skipped, and its stated rule matches the implemented rule.

**Accessibility**
- No state is conveyed by colour alone; all text meets WCAG 1.4.3.
- The game is completable by keyboard alone, and respects `prefers-reduced-motion`.

## 6. Open questions

1. **iOS pinch behaviour needs device verification.** Reviewers disagreed on whether
   `window.innerWidth` tracks the visual viewport and whether `resize` fires on pinch in iOS
   Safari. If it does, `SizeStore`'s listener resizes the board *under the user's fingers* mid-pinch.
   P0-3's CSS-driven layout makes this moot either way, which is the main argument for doing it
   that way. **Do not** feed `visualViewport` dimensions into the board size — that creates the bug
   rather than fixing it.
2. **Show the timer by default?** A visible clock on a deduction puzzle converts thinking time into
   anxiety. Recommend: track it, show it only on the completion card, make the live display opt-in.
3. **Difficulty ramp.** Within each size the three levels differ *only* by rock count — 8/6/4 at
   6×6, 9/7/5 at 7×7, 10/8/6 at 8×8 (`Boards.ts:28-36`) — a one-notch spread, giving nine
   near-identical puzzles per day. Worth designing a real curve alongside P1-6.
