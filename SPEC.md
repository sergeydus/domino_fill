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
h-full` with no positioned ancestor resolves against the initial containing block, covering only
the first viewport of a two-viewport page (D10-b); and the board falls through `squareSize`'s
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
| f | `BoardSquare.tsx:42` | `snap.mp3` plays on **every** square click, including rejected placements — the feedback lies. Also allocates a new `Audio` per click. |
| g | `VerticalNumbers.tsx:13-18`, `HorizontalNumbers.tsx:12-17` | State is encoded by colour **only** (`#4bce4b` / `#ff0000`) — a WCAG 1.4.1 failure. And green fires on *sum satisfied*, not *line correct*, so a line goes green with empty cells still in it. Default `#ababab` on `#e8e7e7` is ~1.8:1, failing 1.4.3. |
| h | `ClientBoard.tsx:57` | A completed board sets `pointerEvents: 'none'` and `completed` is never reset anywhere — with no restart affordance (D10-i), a completed board is a permanent soft-lock. |
| i | `BoardsStore.ts:45` | The difficulty reaction changes level but never resets board state, and never runs on initial load. No restart affordance exists anywhere in the UI. |
| j | `dominoBoard.ts:137,147` + `Boards.ts:38` | **The generator's output format no longer matches the parser.** It builds `boardCode` by bare concatenation and slices it per character, but the runtime compares against a **comma-joined** string (commit `7ef3094`). Single-char slicing also silently corrupts any sum ≥ 10 — and shipped boards contain `10`, `11`, `13`. Any board `DominoBoard` produces today is uncompletable. `allow0Lines`' `code.includes('0')` test is broken for the same reason. |
| k0 | `Tutorial.tsx:27` | `absolute w-full h-full` with no positioned ancestor covers only the first viewport. (`z-999` itself is valid — see D9.) |
| k | ~~`useLocalhost.ts:4`~~ | **✅ Fixed in P0-1.** Read `localStorage` during render (latent SSR crash); misnamed; and wrote `JSON.stringify(value)` while `BoardsStore.ts:29` read `=== 'true'` on the same key. Replaced by `app/hooks/useLocalStorage.ts`; the duplicate encoding is gone with the dead field. |
| l | ~~`SizeStore.ts:12`~~ | **✅ Fixed in P0-3.** `window.onresize =` clobbered any other listener, was never removed, and was unthrottled. Resize is now owned by `useAvailableBoardBox`: `addEventListener`, coalesced to one measurement per animation frame, removed on unmount, and paired with a `ResizeObserver` and `visualViewport`. |
| m | `SkibidiBoard.ts` | 183-line dead copy of `dominoBoard.ts`, never imported. |
| n | `app/constants.ts` | Unused heterogeneous enum. |
| o | `dominoBoard.ts:110` | `findFirstEmpty` uses `i < board[i].length`; at `i === n` this **throws**, it doesn't merely mis-bound. |
| p | `layout.tsx:17` | Metadata is still `"Create Next App"`. |
| q | `globals.css:15` | A dark-mode block darkens `body` while every game surface is hard-coded light grey. |
| r | `DominoClient.tsx:33` | `onContextMenu` is bound to the whole wrapper, so right-clicking the difficulty slider or level arrows also rotates the piece. Fires on Android long-press. |
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

**P0-9b. Rewrite the tutorial's input instructions.** Lands **with P1-1**, teaching the verb that
actually shipped. Leaving a known-incorrect hard gate in place until then would make every
intermediate build awkward to test — which is why the gate itself is removed in P0-9a.

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
  `touch-action: manipulation` on the tray and difficulty buttons.
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
| Space / Enter | Set the focused cell as the anchor |
| Arrows (anchor set) | Choose the neighbour → commits orientation and places |
| Escape | Clear the anchor |
| Delete / Backspace | Remove the domino occupying the focused cell |
| `Ctrl/Cmd+Z` | Undo (P1-3) |

Focus must stay predictable across every transition: after placing, focus stays on the anchor cell;
after removing or undoing, focus moves to the affected anchor; on completion it moves to the
Next-level control. No mode is entered that Escape cannot leave. (P1-8 covers focus *structure* —
roving tabindex, roles — not this state machine.)

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

**P1-2. Hit-test from the cell, not from arithmetic.** Put the handler on `BoardSquare` (or delegate
via `closest('[data-cell]')`).

> **Landed early (row 10).** The `data-cell="i,j"` attribute itself, plus `data-piece`/`data-at`
> on the overlay and `data-select-piece` on the tray, were added in row 10 so the browser tests
> could address cells and pieces at all. Only the *markers* moved early -- the handler and the
> coordinate arithmetic it replaces are still P1-2's work, unchanged. The cell index then comes from the browser's own hit-testing —
zero coordinate math, correct at any zoom, DPR, or fractional cell size, and no `ResizeObserver`
that can disagree with layout. The only rect read is of the one small cell you're provably over.
This is *robustness*, not a zoom fix — the current math is already self-consistent (see §0).

**P1-3. Reset and undo.** Reset is ~5 lines and is the escape hatch for every other bug here; there
is no restart anywhere in the UI today (D10-i), so a mis-solve requires reloading the page. Undo
matters because removal is instant, silent, and destructive. Bounded move stack + `Ctrl/Cmd+Z`.

**P1-4. Completion feedback.** Winning currently sets `pointerEvents: none` and plays a file named
`winSilent.mp3` — the game appears to *freeze* at the moment it should celebrate. Needs a visible
celebration and a Next/Replay affordance within 500ms, plus `aria-live`. Use `inert`, not
`pointerEvents: none`. Play `win.mp3`, which already exists and is unused.

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

**P1-6. Content (promoted from P2 — for a daily puzzle this is the product, not infrastructure).**
Move `DominoBoard` into `scripts/generate-boards.ts`. **Fix the output contract first** (D10-j) —
emit comma-joined sums and repair `allow0Lines`, or the generator ships uncompletable boards.
Replace enumerate-every-solution with a search that **aborts on the second solution**.

**Pick the content strategy explicitly** — "a new puzzle every day indefinitely" with no backend
and no runtime generation is not satisfiable by a finite JSON bundle, and the draft asserted all
three at once. The options, in order of preference:

1. **Pre-generate a fixed horizon (recommended): 10 years ≈ 3,650 day-entries × 9 boards.**
   Measured from the current file (2 day-entries, 9 boards each):

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

**P1-7. Persist progress.** `{board, completed, elapsedMs}` under a versioned namespace, keyed by
the **`puzzleId`** from P0-5 — one identity across cache, persistence and archive — with the
stored record carrying the `definitionHash` so a changed puzzle invalidates its session instead of
silently loading mismatched state. **Reuse the server-safe pattern P0-1 established in
`app/hooks/useLocalStorage.ts`** — initialise from a default, hydrate in a `useEffect`, never read
during render, wrap every access in `try/catch` — rather than reaching for storage directly.
Migrate or discard on version mismatch. Sequence carefully against P0-5: cloning on ingest will destroy in-progress
boards unless the Map is populated first.

**P1-8. Accessibility.** Real `<button>`s for `LevelSelector` and `DominoPieces`; `aria-pressed` /
`role="radiogroup"` on the difficulty slider. If `role="grid"` is used it needs `role="row"`
children and a **roving tabindex** (container `tabIndex={0}`, focused cell `0`, rest `-1`) — 64
focusable cells is otherwise 64 tab stops; a `role="group"` of labelled buttons is the simpler
option. `<MotionConfig reducedMotion="user">` at the root covers every animation in one line.

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
| 12 | **P1-2** move hit-testing onto the cells | E2E |
| 13 | **P1-1** unified verb: pointer drag, tap, keyboard — **with P0-9b** | E2E |
| 14 | **P1-3** undo + reset | unit (undo tests land here) |
| 15 | **P1-4** completion feedback | E2E |
| 16 | **P1-5** honest feedback; shake on reject; check/hint only if the solver contract is built | unit |
| 17 | **P1-7** persistence + day rollover | unit |
| 18 | **P1-6** generator format fix, solver rewrite, content pipeline, archive | unit |
| 19 | **P1-8** accessibility: roles, roving tabindex, `MotionConfig` | E2E |
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
