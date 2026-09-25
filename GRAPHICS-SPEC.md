# Graphics spec

An improvement spec for what the game *looks like*, written the same way as `SPEC.md`: one
row per atomic commit, every claim owing a test, and nothing asserted that has not been
measured.

`SPEC.md` is complete and is the ground this stands on. Where the two disagree, `SPEC.md`
wins — its contrast ratios, its 38px cell floor, its accessibility tree and its layout
budget are guarantees that were measured into place, and none of them is a style choice
this spec may trade away. The short version: **this spec may change how the game looks; it
may not change what the game promises.**

---

## 1. What is there now, measured

Everything below was measured against a production build in Chromium at `devicePixelRatio`
1, at the two viewports the layout criteria are written against. It is recorded here
because a graphics spec that starts from impressions produces graphics work that cannot be
reviewed.

### 1.1 The art does not scale with the board

The pieces are inline SVG drawn from `squareSize`, but every detail inside them is an
absolute pixel constant: `strokeWidth = 6`, `rx = 8`, pip `r = 8`, a 16px divider inset, a
16px extrusion, a 26px motion offset. The cell those constants sit on ranges from **38px**
(the phone floor, `MIN_CELL_PX`) to **53px** at the widest shipped configuration — so the
same drawing is a different picture at each end.

| Drawing constant | as a fraction of the cell at **38px** | at **53px** | swing |
| --- | --- | --- | --- |
| outline stroke (6px) | 0.158 | 0.113 | 1.40× |
| corner radius (8px) | 0.211 | 0.151 | 1.40× |
| pip diameter (16px) | **0.421** | 0.302 | 1.39× |
| divider span (`size − 32`) | **0.158** | 0.396 | **2.51×** |
| extrusion depth (16px) | 0.421 | 0.302 | 1.39× |
| entry animation offset (26px) | 0.684 | 0.491 | 1.39× |

Measured cells, by difficulty: 6×6 → 53 / 7×7 → 46 / 8×8 → 41 at 1280×800; all three land
on the 38px floor at 360×640.

> **Amendment (row 2) — the range is 38–106px now, not 38–53.** The table above was
> measured before P0-1 existed. Row 1 gave the desktop a board of its own, and re-measured
> against that build the cells are 6×6 → 85 / 7×7 → 74 / 8×8 → 66 at 1280×800, and
> 106 / 92 / 81 at 2560×1440, where the 720px cap holds them. The phone is unchanged: all
> three still land on 38 at 360×640.
>
> The constants did not move, so every swing in the table got wider:
>
> | Drawing constant | at **38px** | at **106px** | swing |
> | --- | --- | --- | --- |
> | outline stroke (6px) | 0.158 | 0.057 | 2.79× |
> | corner radius (8px) | 0.211 | 0.075 | 2.79× |
> | pip diameter (16px) | 0.421 | 0.151 | 2.79× |
> | divider span (`size − 32`) | 0.158 | 0.698 | **4.42×** |
> | extrusion depth (16px) | 0.421 | 0.151 | 2.79× |
> | entry animation offset (26px) | 0.684 | 0.245 | 2.79× |
>
> This is the direct cost of P0-1, recorded rather than smoothed over: making the board
> bigger on the desktop made an absolute-pixel drawing *less* consistent, because the same
> 6px outline now has to read on a cell nearly three times the phone's. It is the argument
> for P0-6 made stronger, not a new problem — but it means "the widest shipped
> configuration" in this section is 106px from here on, and the original table stays as
> what the suite reproduces at the two sizes it was measured at.

Read the table the way a player meets it. **The phone gets the worst of it in every row**:
the outline is 40% heavier, the pip swells to 42% of the cell, and the divider — the line
that says "this is a domino and not a tile" — collapses to 16% of the width, a stub. The
art degrades precisely where space is tightest and where most of the play happens.

### 1.2 The palette has no single source

`SPEC.md` row 20c single-sourced the *ground* (`--background`), and row 11 measured the line
states into `lineLabel.ts`. Everything else is a literal at its use site — roughly twenty of
them across nine files, in three vocabularies:

| Role | Value(s) | Where |
| --- | --- | --- |
| ground | `#e8e7e7` | `globals.css`, `siteMetadata.ts`, `scripts/icon.ts` |
| cells | `#cbcbcb` / `#ababab` | `BoardSquare.tsx` |
| board frame | `#666666` | `ClientBoard.tsx` |
| tile face / side | `#FFF3D6` / `#8d8778` | `DominoPieceOne.tsx`, `DominoPieceTwo.tsx`, `icon.ts` |
| rock | `#868686` / `#656565` | `Rock.tsx` |
| pip | `black` … but `#1a1a1a` in the icon | pieces vs `scripts/icon.ts` |
| accent | `#419dc8` | `DifficultySlider.tsx`, `CompletionCard.tsx` |
| arrows | `#4FC3F7` / `#0288D1` | `LevelSelector.tsx` (Material palette — a fourth blue) |
| line states | `#5f5f5f` / `#15661a` / `#a10000` | `lineLabel.ts`, `BoardSquare.tsx`, `AdviceStrip.tsx` |
| control surface | `#ababab` | `GameControls.tsx`, `DifficultySlider.tsx`, `DominoPieces.tsx` |
| incidental | `red-700`, `amber-100` | `Archive.tsx`, `DayBanner.tsx` |

Two of these have already drifted: the pip is `black` on the board and `#1a1a1a` in the
generated icon, and the accent blue and the arrow blues are three different blues doing one
job. Note the last two rows: a literal audit that looks only for `#rrggbb` would miss both
a CSS named colour and a Tailwind utility.

> **Amendment (row 5) — the count was low.** "Roughly twenty across nine files" was an
> estimate. The audit, run over this tree, finds **71 literals in 20 files**; see P0-5's
> amendment for the breakdown. The table above is the part the estimate got right.

### 1.3 Everything reads as one grey object

At 1280×800 the whole page is `#e8e7e7` ground, `#ababab`/`#cbcbcb` cells, a `#666666`
frame, grey rocks, grey controls and a grey tray. The two coloured things on the screen are
**the difficulty selector** — the loudest element on the page, at the top, bold, and pressed
once a session — and **the level arrows**, in a different blue, at the bottom. The board,
which is the entire product, is the lowest-contrast region of its own page.

### 1.4 A rock is drawn as a domino

`Rock.tsx` and `DominoPieceOne.tsx` are the same silhouette: rounded rectangle, same `rx`,
same black outline, same extrusion, differing only in fill. Two rocks stacked vertically are
visually a vertical domino. The accessibility tree tells them apart (row 19 named every
cell); the picture does not.

### 1.5 Layout and rendering details

- **28.4% of the width.** The shell is 363px in a 1280px viewport. The desktop view is
  mostly empty ground.
- **Zero CSS transitions on the page.** All motion is `motion/react`: piece entry, the
  rejection shake, a difficulty hover. Hover and press states are instantaneous.
- **No visual test of any kind.** No `toHaveScreenshot`, no geometry assertions on the art.
  413 browser tests, and not one of them would notice if every piece turned black.
- **Type has two sources.** `body` sets `Arial, Helvetica, sans-serif` while `page.tsx`
  sets `font-sans` → Geist, so the app renders Geist and the body rule is a vestige that
  applies to whatever escapes that div.
- **Fractional shell origins**, recorded as an observation and *not* as a defect: the shell
  lands at `x = 458.5` (6×6) and `x = 489.98` (8×8) at 1280×800. Integer CSS coordinates are
  not synonymous with crisp rendering, and no crop here demonstrates visible blur. If the
  pinned baselines show it, it earns a row then; until then it is a number, not a problem.

---

## 2. The brief

### 2.1 Art direction

**Preserve the game's visual identity and improve it comprehensively in a distinctly
cartoony direction. This is an evolution, not a redesign.** Someone who played yesterday
must recognise it today; someone new should meet a polished physical toy rather than a
diagram.

What that means, concretely:

- **Chunky, friendly silhouettes.** Rounded, proportional outlines — weight that reads at
  38px without swallowing the tile.
- **Slightly exaggerated depth.** Playful dimensional pieces with soft extrusion and
  shadow. Depth is a toy's depth, not a render's.
- **A warm, saturated-but-not-neon palette**, including a warmer checkerboard and a subtly
  warm off-white ground (P1-3).
- **Irregular, faceted rocks** — expressive, and visibly not dominoes (§1.4).
- **Clear pip faces and divider lines at 38px.** The phone is the design target, not the
  place the design degrades to.
- **Small, responsive bounce and squash.** Restrained: feedback, not choreography.
- **Minimal decorative clutter.**

Explicitly avoid: sterile flat UI, realism, heavy or multi-stop gradients, texture noise,
and ornament that does not carry information.

### 2.2 Hierarchy

**The board and the pieces are the hero.** Controls are quieter than they are today — the
difficulty selector in particular stops being the loudest element on the page.

Completion and error feedback **may use their own semantic colours** rather than being
forced through a single accent. One accent for interactive chrome; separate, named semantic
colours for success, problem and hint. This supersedes an earlier draft's "one accent,
everywhere", which would have flattened meaning into decoration.

### 2.3 Desktop

Above roughly `min-width: 1024px` **and** with enough height for it, the board grows and the
secondary controls move into a compact side rail or adjacent panel. Below that, the existing
single-column composition is kept in its existing order.

**The rail holds** the difficulty selector, puzzle navigation and Archive, the
Check / Hint / Undo / Reset group, and Sound. **The domino legend stays visually associated
with the board** — it is the scoring key for what is on the board, not chrome, and P1-1 of
`SPEC.md` is explicit that it is a legend.

This is a composition decision, so it lands **before** any baseline is captured — otherwise
every baseline is taken against a layout that is about to change. It is row 1.

### 2.4 Mobile

**The complete 8×8 board must fit 360px with no horizontal scrolling**, and the **38px
minimum cell stays** for this project. Proportional artwork has to be legible at that size;
that is the art's problem to solve, not the floor's. The floor may not be raised unless an
alternative mobile layout is designed and tested, which is not in this spec.

---

## 3. What this spec does not do

Recorded up front, because an unwritten exclusion is indistinguishable from an oversight.

- **No dark palette.** Row 20c dropped the half-theme after measuring the advice strip at
  **1.05:1** under `prefers-color-scheme: dark`, and `e2e/theme.spec.ts` now asserts the two
  schemes render identically. A second ground means re-proving every contrast pair in this
  document against it. Light-only stays a deliberate cut.
- **No canvas, WebGL, sprite sheets or illustration pipeline.** Row 19 spent itself making
  the board a real `role="grid"` with per-cell labels, roving tabindex and programmatic
  focus. A canvas board gives that up, and no visual gain is worth it.
- **No new runtime dependencies.** The art stays hand-rolled inline SVG and CSS.
- **No change to the gameplay rules, the corpus, or the layout *budget*.** `MIN_CELL_PX`,
  `GUTTER_FRACTION`, `LABEL_FONT_FRACTION` and the shell arithmetic are `SPEC.md`'s. Row 1
  changes the desktop *composition* around them; it does not edit them.

---

## 4. Invariants that must survive every row

Guarantees already measured into the repository. Any row that would break one stops and
says so rather than quietly retuning it.

| Invariant | Value | Owner |
| --- | --- | --- |
| target label contrast, neutral / satisfied / over | 5.17 : 5.77 : 6.76 | `lineLabel.ts`, D10-g |
| advice strip contrast | 14.53 | `AdviceStrip.tsx`, P1-5 |
| minimum cell | 38px | `MIN_CELL_PX`, §2.4 |
| 8×8 fits 360px with no horizontal overflow, 50%–200% zoom | — | `e2e/layout.spec.ts` |
| grid roles, per-cell labels, one tab stop, focus sync | — | row 19, `e2e/accessibility.spec.ts` |
| the piece overlay is `aria-hidden` and takes no pointer events | — | D4, row 19 |
| `touch-action: pinch-zoom`, static in CSS | — | P1-1 |
| reduced motion honoured | `MotionConfig reducedMotion="user"` | `provider.tsx` |
| state is never signalled by colour alone | — | P1-8 |
| icons are a pure function of `scripts/icon.ts`, maskable mark inside r = 0.4 | 0.368 | rows 20b, 20h |

Note that the ground is an input to four of these and to the manifest. P1-3 changes it
deliberately and pays the whole bill in one commit; see that row.

---

## 5. P0 — the foundation

Composition first, then the ability to see a regression, then the two refactors that make
the art tunable. No art row starts until all of P0 is in.

### P0-1 · The desktop composition (§2.3)

**Problem.** §1.5: the shell is 363px in a 1280px viewport, and the chrome is stacked in one
column beneath it — the phone's answer given to a desktop.

**Shape.** A breakpoint at approximately `min-width: 1024px`, qualified by available height
so a short landscape window does not get a layout it cannot hold. Above it: a larger board
and the rail of §2.3. Below it: today's composition, in today's order.

**Acceptance.**

- Measured **at 1280×800**, which is the desktop viewport this suite already uses: the 8×8
  board's cell is **≥56px** (today: 41), and board-plus-rail occupies **≥60%** of the
  viewport width.
- Larger viewports may **cap** at a deliberate, named maximum rather than growing without
  limit; the cap is a constant with its own test, not an emergent number.
- Below the breakpoint the composition is single-column in the current order, and the chrome
  row count is unchanged, so `e2e/sound.spec.ts`'s budget assertion still holds.
- The legend remains adjacent to the board at every size (§2.3).
- Every existing layout guarantee passes untouched: 8×8 at 360×640, 800×400 landscape,
  50%–200% zoom, no horizontal overflow, the safe-area cases.
- No change to `MIN_CELL_PX`, `GUTTER_FRACTION`, `LABEL_FONT_FRACTION` or the shell
  arithmetic.

### P0-2 · Geometry assertions for the art as it stands

**Problem.** Nothing can currently fail when the drawing changes.

**Shape.** Geometry assertions are the spine of this spec: box positions, SVG attribute
ratios and computed colours are readable in a diff, reviewable by a person, and stable
across platforms in a way pixels are not. This row pins **today's** art, so every later row
has something to move deliberately.

**Acceptance.** Each of the six constants in §1.1 is asserted at two cell sizes, so the
table above is reproduced by the suite rather than by this document.

> **Amendment (row 2) — which two sizes, and where each is proven.** "Two cell sizes"
> became two different pairs once row 1 moved the top of the range, and the row asserts
> both rather than choosing:
>
> - **38 and 53, in a unit test** (`tests/pieceGeometry.test.tsx`), which reproduces §1.1's
>   table exactly — pixel value and fraction, every instance on a fixture holding one piece
>   of each kind. It renders the real piece layer to a string, because the entry offset is `motion`'s initial state and
>   exists only in a render whose effects have not run.
> - **38 and 106, in the real build** (`e2e/art.spec.ts`), the actual ends of today's range:
>   the cell is measured where the layout decides it, then **every piece on the live
>   board** — both placed dominoes and all of the day's rocks — is read with the same reader
>   the unit test uses (`e2e/artGeometry.ts`). The entry offset is caught by a
>   `MutationObserver` at insertion, before any frame can move it. Fixture-derived: the
>   dominoes go wherever today's board has room. That room exists on all 10,959 easy boards
>   of the 3,653 published days, measured at row 2; the generator does not promise it for
>   days appended later, and a day without it fails loudly rather than skipping.
>
> The unit test also pins the widened swings of the §1.1 amendment at 38 and 106, as the
> size of the problem the art rows inherit.

### P0-3 · A component sheet built from the real components

**Problem.** The day's puzzle comes from the player's local date, so any sheet taken from a
live board rots overnight. But a sheet assembled out of copied markup proves nothing about
what ships: it would be a second implementation of the art, passing while the real one
broke.

**Shape.** A **test-only route** that imports the production components — `BoardSquare`,
the three piece components, the label and control components — and renders them over
fixtures: both domino orientations, a rock, an empty cell of each checker tone, the three
target states, the anchor / candidate / hint / focus states, the completion card, and one
of each control variant.

The route is **excluded from compilation**, not merely from routing. A guard that renders
`notFound()` behind a runtime flag would still compile the sheet, its fixtures and every
component they pull in into the production bundle — the code would ship and only the URL
would be shut. Instead the fixture file carries its own extension (`page.visual.tsx`) and
`next.config.ts` adds `visual.tsx` to `pageExtensions` **only when the build flag is set**.
With the flag off the file is not a route, nothing imports it, and it is not compiled at
all. `e2e/server.ts` already builds with `NEXT_PUBLIC_SITE_URL` set for the metadata tests
(row 20f), so a build-time flag follows an established path.

Because it is the real route in the real build, it carries the real Tailwind output, the
real client components, and real hydration — the three things a hand-assembled sheet would
quietly fake.

**A caution carried from review.** Custom `pageExtensions` has had App Router edge cases in
Next's own history, so row 3 exercises **both** build modes against the installed version
rather than trusting the configuration, and mutation-tests removing the conditional
extension. If Next behaves differently than expected, the production-bundle absence contract
above is what holds and the mechanism is what changes — not the other way round.

**Rejected alternative:** Playwright component testing
(`@playwright/experimental-ct-react`). It would need a second bundler and its own Tailwind
pipeline, so the styling it proves is not the styling that ships — which is the whole
question a visual baseline exists to answer.

**Acceptance.**

- The sheet renders with the clock un-pinned and is identical on two different dates. Every
  state named above appears exactly once, asserted by count rather than by eye.
- **Absence from the production bundle is proven, not inferred from a 404.** A 404 says the
  router declined to serve it; it says nothing about whether the code was shipped. So,
  against a build made without the flag:
  - a sentinel string declared **only** in the fixture module appears **zero** times across
    the emitted server and client output under `.next`, searched as bytes;
  - the fixture route is absent from the build's route output — the same listing
    `npm run build` prints, which row 20a already used to prove a duplicate route was gone;
  - and it 404s, which is necessary and by itself would prove nothing.

> **Amendment (row 3) — the mechanism as built, and what building it measured.**
>
> **One flag, three effects.** `DOMINO_VISUAL_SHEET=1` adds `visual.tsx` to
> `pageExtensions`, moves the build to `.next-visual`, and gives that build its own
> `tsconfig.visual.json`. Without the flag the config spreads nothing: a unit test holds the
> production config to its one pre-existing key. The browser suite builds both and serves
> both — production on 3100 exactly as before, the sheet on 3101 — so no existing spec moved
> off the build that ships, and `/visual` is `/visual?cell=38` or `?cell=53` on the second.
>
> - **The separate distDir** is what lets both builds coexist. The E2E setup empties it
>   before building: measured, with the distDir removed the sheet build overwrote
>   production, and while the absence checks caught that, every positive control passed
>   against a `.next-visual` left from an earlier run.
> - **The separate tsconfig** answers two measurements that pull opposite ways. Next rewrites
>   the tsconfig it builds with to include any unfamiliar `distDir`'s types, reformatting the
>   whole file — so they must be declared up front. Declared in `tsconfig.json`, a stale
>   sheet build (a route renamed since) failed `tsc --noEmit` *and* the production build.
> - **The build order** closes the second route in, found in review. Every build rewrites the
>   untracked `next-env.d.ts` to import its own route types, and an ordinary `tsc` follows
>   that import, which no tsconfig can prevent. So whichever build runs last decides what a
>   developer's next `tsc` reads. The suite builds the sheet first and production last, and
>   checks the result: `next-env.d.ts` imports `.next/types/routes.d.ts`, and
>   `tsc --listFilesOnly` lists nothing under `.next-visual` (while the sheet's own tsconfig,
>   as the control, does). Reversing the order fails both. A sheet build run by hand still
>   points `next-env.d.ts` at the sheet until the next production build.
>
> **Both build modes, against the installed Next 16.0.10.** Flag on and flag off are
> exercised by every browser run. The builder was probed by hand as well, because Turbopack is
> this version's default and custom `pageExtensions` edge cases are historically webpack's:
>
> | | route listed | files containing the sentinel |
> | --- | --- | --- |
> | Turbopack, flag on | `/visual` | 6 |
> | Turbopack, flag off | — | 0 |
> | webpack, flag on | `/visual` | 6 |
> | webpack, flag off | — | 0 |
> | Turbopack, extension unconditional (the mutation) | `/visual` | 6 |
>
> The gate runs Turbopack only, which is what `npm run build` ships.
>
> **Positive controls.** Each absence check is first made of the sheet build, where the
> sentinel *must* be: the sentinel is rendered, not merely declared, so a build that compiled
> the module keeps it; and the test reads it from its one declaration rather than restating
> it, with a check that no other file in the repository contains it.
>
> **"Exactly once", made precise.** A 2×2 board is the smallest that can show each state, and
> every board also shows both cell tones and some neutral labels, so the count is taken two
> ways. Interaction states, the two non-neutral target states, the completion card and every
> control appear **exactly once on the whole sheet** — anywhere else is a leak. Pieces, cell
> tones and the neutral target are counted **within the specimen that exists to show them**,
> because they are necessarily context elsewhere (a satisfied line needs something on it).
> Candidates count two: a tap anchors only where there are two ways to finish.
>
> **Two components extracted, one constant moved.** `Archive` and `Sound` were inline JSX in
> `DominoClient`; the sheet cannot import JSX, and copying it is what the row forbids. They
> are `PageButtons.tsx` now, with unchanged markup. `MIN_CELL_PX` moved to `cellFloor.ts`:
> `PuzzleSession.ts` is `"use client"`, and a server component importing a value from a
> client module receives a client reference — measured, `?cell=37` passed the floor check
> and was served.
>
> **"Identical on two dates" is judged on markup and layout, not pixels** — for a measured
> reason P0-4 inherits. On this development host, two at-rest screenshots of the sheet *on
> the same date* differed in 4 of 10 pairs: at most 4 pixels, at most 13 levels of one
> channel, at the edge of an animated piece, with or without `reducedMotion: 'reduce'`. A
> pixel comparison fails as often with the dates equal as with them apart, so it cannot
> answer the date question. What a date could change — text, attributes, inline style,
> layout — is compared instead, at rest, which is itself a state waited for (every inline
> opacity 1, every inline transform `none`), not a pause.
>
> **The clock is shifted, not pinned.** With `page.clock.setFixedTime`, the completion
> card's fade-in never finished in 7 of 360 loads (stuck at `opacity: 0`); with the clock
> untouched, 0 of 360. `performance.now()`, the document timeline and `requestAnimationFrame`
> all kept advancing under the pinned clock, so the mechanism is not established. The date
> test moves only the calendar, with a `Date` shim that keeps time flowing.
>
> **What P0-4 took from this.** The Windows host's noise does not reach P0-4's budget,
> because baselines are neither taken nor compared anywhere but the CI runner — there is no
> Linux-versus-Windows difference to budget for. What P0-4 measures instead is stability on
> the runner itself: the same machine agreeing with itself (a regeneration run compares
> against its own baselines 25 times), and different runner machines and images agreeing
> with the committed set. And the full-page pair fixes its day with this same calendar
> shift, not `page.clock.install`, which was never measured against the stuck-card failure.
> Both are recorded, with their numbers, in P0-4's amendment.

### P0-4 · Four deterministic baselines

**Shape.** Exactly four. This is settled, not a starting point:

| # | Baseline | Depends on the day? |
| --- | --- | --- |
| 1 | component/state sheet at **38px** | no |
| 2 | component/state sheet at **53px** | no |
| 3 | complete **360px phone** composition | yes — calendar shifted to a fixed day |
| 4 | complete **desktop** composition | yes — calendar shifted to a fixed day |

Baselines 3 and 4 are the **ordinary** compositions — a board mid-play, not a board
mid-celebration. Transient surfaces belong on the sheets, where they can be rendered
deliberately and one at a time: the completion card is a fixture in P0-3, not a state the
full-page baseline has to be manoeuvred into.

The full-page pair fixes the day with the calendar shift of `e2e/calendar.ts`: the page
believes it is a fixed date, in UTC, and its animation clocks run untouched. Not
`page.clock` — see the amendment below for why. The sheets shift nothing; they are proven
date-independent (P0-3).

**The comparison environment.** Rasterisation differs between the Windows machine this is
developed on and the Linux machines CI runs on, so the comparison environment is part of
the test, not a detail of it. **No Docker, anywhere** — not on the development machine and
not as a `container:` job, service or image in GitHub Actions; the project owner's
requirement, and not to be reintroduced without asking. So:

- Baselines are taken and compared **only** on a GitHub-hosted **`ubuntu-24.04`** runner (a
  release label, never `ubuntu-latest`), with Playwright's Chromium installed directly
  (`npx playwright install --with-deps chromium`) — the `visual` job in
  `.github/workflows/ci.yml`. Playwright's version, and with it Chromium's build, is pinned
  by the lockfile; changing it, or the runner label, is a deliberate commit that
  regenerates baselines.
- The runner **image** is not pinned: GitHub updates it within a release. Every baseline set
  records the environment it was taken in (`visual-tests/__screenshots__/environment.json`)
  and every comparison warns on any difference from it. This is the accepted trade-off of
  having no container; the amendment below records it and what was measured against it.
- `deviceScaleFactor: 1`, `reducedMotion: 'reduce'`, light scheme, `en-US`, UTC — in
  `playwright.visual.config.ts`. Fonts are `next/font`-self-hosted, and `e2e/fonts.spec.ts`
  proves every glyph on the baseline pages is drawn from them rather than from a system
  font. That establishes the font *selection*; it does not make rasterisation identical
  across runner images, which is what the environment record is for.
- Chromium runs with `--disable-partial-raster`, because with it the screenshots repeat and
  without it they measurably did not. Why it works is not established; see the row-7 note
  under the amendment below.
- Baselines are never taken on a developer's host: `npm run visual:update` refuses to run
  anywhere but the CI runner, and a commit message containing `[visual update]` is how CI
  is asked to regenerate them (see **Sequencing** in §8).
- The budget is **zero**: `maxDiffPixels: 0` at pixelmatch `threshold: 0`, justified by a
  measured flake rate across machines rather than chosen to make the suite pass — see the
  amendment for the runs, and for what pixelmatch cannot count at any setting.

**Acceptance.** Two consecutive runs of the unchanged suite produce zero diff. And for every
row in §6 and §7: reverting that row's change fails **a named targeted assertion appropriate
to what it changed** — a geometry assertion, a computed-token assertion, an accessibility
state, or a motion contract — *as well as* its relevant screenshot. A screenshot is never the
only thing standing behind a row, and no row is asked for a geometry assertion it has no
geometry to make.

> **Amendment (row 4) — no container; a plain Ubuntu runner, and what that costs.**
>
> **No Docker, anywhere.** The project owner does not want Docker used in this project — not
> on the development machine, and not as a `container:` job in GitHub Actions either. This
> spec originally asked for the official Playwright container pinned by image digest; that
> plan is replaced, not approximated, and the environment above is already the replacement:
> baselines are taken and compared on a GitHub-hosted runner with Playwright's browser
> installed directly (`npx playwright install --with-deps chromium`), the same way the
> existing gate job runs.
>
> **What is still pinned.** Playwright's version, and with it Chromium's exact build, by the
> lockfile. The runner label (`ubuntu-24.04`, not `ubuntu-latest`), so an Ubuntu release change
> is a deliberate commit. `deviceScaleFactor: 1`, `reducedMotion: 'reduce'`, `colorScheme`,
> locale, and a UTC timezone, in `playwright.visual.config.ts`.
>
> **What is not, and the trade-off stated plainly.** GitHub updates the runner *image* within
> a release — system libraries, fonts, drivers — and a digest-pinned container existed to make
> that impossible. Without one, an unchanged commit can in principle fail its comparison
> after an image update; Playwright's own guidance is to take and compare baselines in the
> same environment, and this is the same environment only up to GitHub's image version.
> Two mitigations, neither of which removes the risk:
>
> - **Every baseline set records its environment** — runner image version, OS, Playwright,
>   Chromium build, and a fingerprint of the installed system fonts — in
>   `visual-tests/__screenshots__/environment.json`, and every comparison prints any
>   difference from it as a warning. A failure after an image update says so, instead of
>   looking like a regression.
> - **System fonts are proven not to draw anything.** `e2e/fonts.spec.ts` asks Chromium
>   which font drew every text node on both baseline pages and on the sheet, and requires
>   the self-hosted Geist files for all of them — with a positive control that a system-font
>   span *is* reported as one. It is not a pixel test, so it runs on every host.
>
> If image drift turns out to make the comparison unreliable, the fallback is the one this
> spec already leans on: geometry, computed tokens, accessibility state and motion contracts,
> which do not depend on the rasteriser. Baselines would then be advisory rather than gating.
> That is a decision for the owner, not something to slide into.
>
> **Baselines are never taken on a developer's host,** now enforced: `npm run visual:update`
> refuses to run anywhere but the CI runner, and the config sets `updateSnapshots: 'none'`, so
> a missing baseline fails instead of being written. `npm run test:e2e` never runs the
> visual suite; `npm run test:visual` does, and only CI's result counts.
>
> **Regenerating, without a dispatch button.** A manually-triggered workflow must live on the
> default branch, and no workflow does. So a commit message chooses the mode: `[visual update]`
> regenerates on the runner, uploads the set as the `visual-baselines` artifact, and then
> compares against it 25 times on the same machine; the set is downloaded
> (`gh run download`) and committed from the host. **This splits a pixel-changing row into two
> commits** — the change, whose run produces the baselines, and the baselines, whose run
> compares them. Keeping one atomic commit would mean pushing temporary branches to the
> repository, which has not been asked for.
>
> **What "zero diff" means here — corrected.** Part 2 (`5338d0f`) recorded that the regenerate
> run at `bdff2ae` made "100 comparisons, every one zero pixels different". That overstated it.
> `toHaveScreenshot` counts differences with **pixelmatch**, which (a) ignores any pixel it
> classifies as anti-aliasing, and Playwright exposes no way to include them, and (b) forgives
> each pixel a colour difference below `threshold`, which defaulted to 0.2 in YIQ space — a
> tolerance nobody had chosen or measured. Those 100 comparisons were zero *as pixelmatch
> counts at 0.2*, which is much less than zero pixels.
>
> **Measured, what the comparison can and cannot see.** Six small changes to the art, each
> compared against baselines taken just before it (on the development host: this is a
> property of the comparator, not of the rasteriser):
>
> | change | at `threshold` 0.2 (the default) | at `threshold` 0 |
> | --- | --- | --- |
> | rock outline 6 → 7px (half a pixel each side) | passes | passes |
> | rock outline 6 → 8px | fails, 399–3,901 px | fails, 400–3,901 px |
> | pip radius 8 → 9 | passes | passes |
> | divider one pixel longer | fails, 4 px | fails, 4 px |
> | tile face `#FFF3D6` → `#FFF0D0` | passes | fails, 2,618–12,986 px |
> | dark cell `#cbcbcb` → `#c8c8c8` | passes | fails, 17,452–86,587 px |
>
> So `threshold` is **0**: at the default, the screenshots could not see a colour change of
> the size the palette rows (P0-5, P1-3) will make. The two changes that pass at 0 alter only
> anti-aliased edge pixels, and pixelmatch cannot be made to count those — which is why they
> are not the screenshots' job: row 2's geometry assertions fail on exactly those two
> (mutations A1 and A3 there). The division of labour the acceptance above asks for is now a
> measured one rather than an assumed one.
>
> **The budget at `threshold` 0, measured.** The regenerate run of part 3 (`63ef5d9`, CI run
> 35933599943, image `ubuntu24 20260920.314.1`) retook the baselines and compared against them
> 25 times on the same runner: 100 of 100 passed. That is one machine agreeing with itself.
>
> Across machines it is not quite zero. Compared with part 2's set — taken on image
> `20260907.300.1`, on a different runner — three of the four baselines are **byte-identical**,
> and `sheet-53` differs in **22 pixels**, scattered over three specimens, almost all by one
> level of one channel and at most by 13. Nothing the page draws differs; it has the look of
> rasterisation rounding that depends on the machine — GitHub's pool mixes CPU models, and
> Chromium rasterises in software on these runners.
>
> **Measured across machines: no tolerance needed.** Part 4 (`ea0244f`, CI run 35934186079)
> compared against these baselines in six runs — the original and five re-runs, each on a
> newly drawn machine — at `threshold` 0 and `maxDiffPixels` 0: **48 comparisons, all zero
> diff**, on four CPU models (AMD EPYC 9V74, 7763 and 9V45; Intel Xeon Platinum 8573C) and
> both runner images then in GitHub's pool (`20260920.314.1` and `20260907.300.1`). And the
> 22 pixels that differ between the two baseline sets are themselves not counted: part 2's
> `sheet-53` checked against part 4's with `toMatchSnapshot` at `threshold` 0 passes, so
> pixelmatch classifies them as anti-aliasing. The variation between machines seen so far
> lives entirely in what the comparator is built to ignore.
>
> So the budget stays at zero, with no tolerance to justify. What that does *not* prove is
> that a future image cannot move a pixel pixelmatch counts; the environment record is
> there to say so the day one does.
>
> Row 3's same-date noise (4 of 10 pairs differing on the Windows host) is a raw
> `page.screenshot()` measurement; `toHaveScreenshot` also waits for two identical frames and
> disables CSS animation, on top of the at-rest wait, and locally the four baselines matched
> 20 of 20 at 0.2 and 12 of 12 at 0 — while two regenerations of `sheet-38` still produced
> different bytes, so the host is not byte-stable even where the comparison passes.
>
> **The full-page day is shifted, not pinned.** `page.clock.install`, the original plan, was never
> measured for the completion-card failure row 3 found under `setFixedTime`. The baselines use
> the calendar shift row 3 did measure (`e2e/calendar.ts`): the page believes it is
> 2026-10-15, in UTC, and its animation clocks run untouched.
>
> **Found at row 7: run-to-run noise, removed by a Chromium switch.** Rows 3 and 6
> both met a few-pixel cluster that toggled between runs of *unchanged* code: on the
> development host, and on CI's target specimens. Pixelmatch classed it as anti-aliasing, so
> the comparison passed. Row 7's art put one pixel of it outside that class. Its
> regenerate run (`de64343`, CI run 36037464287) then failed **7 of 25** same-runner
> comparisons of the 53px sheet, each by exactly one counted pixel. All seven failing shots
> were the same image, 11 raw pixels from the baseline, in the cluster row 6 had already
> measured.
>
> **What was measured,** on the development host with row 7's art:
> - ten shots of the 53px sheet, **three different images** (6, 3 and 1 of each);
> - with `--disable-partial-raster`, **one image** in ten;
> - five shots of each of the four baselines with the switch, one image each.
>
> On CI with the switch (`e71b343`, run 36039783428), the regeneration then matched its own
> baselines **100 of 100** on the same runner. Row 7's baselines at `a0a998f` passed 8 of 8
> in each of six attempts on newly drawn machines, **48 of 48**, on AMD EPYC 7763 and 9V74.
> No Intel runner was drawn this time.
>
> **Why it works is an inference, not a finding.** By its name, the switch stops Chromium
> re-rasterising only the invalidated part of a tile. A partial raster whose seam depends
> on earlier invalidations would explain noise that follows timing rather than the page.
> But Chromium's definition of the switch also disables persistent GPU memory buffers, and
> every A/B run above toggled both together. The measurements establish that the switch
> removes the noise, not which of its effects does. Isolating them was not attempted.
>
> The switch is now in `playwright.visual.config.ts`, kept for the measured result. The
> contract stays: threshold 0, no budget, and two runs of unchanged code must agree. What
> changed is the rendering setup that was breaking it. The switch changes the bytes of every
> baseline, so it was committed on its own, with a regeneration, and measured across
> machines again.
>
> **A row-1 defect the baselines showed, now fixed.** In the desktop rail, the difficulty
> selector could get no narrower than 276–278px (its three options at their narrowest,
> depending on which one is bold) in a 260px rail, so "Hard 8x8" ran 8px past the rail and
> its own grey background — at every desktop width, since the rail's width is a constant.
> Row 1's tests did not catch it: they asserted where each control is, never that it is
> inside what holds it. The rail and board sizes stay; the options' horizontal padding drops
> from 8px to 4px a side (`px-1`), which makes the narrowest arrangement 252.0–253.9px and
> leaves 6px. The labels already wrapped onto two lines, and the flex row gives any spare
> width back to the buttons, so nothing looks tighter.
>
> `e2e/desktop.spec.ts` now selects each option in turn and requires every option inside
> the selector's **content** box and the selector inside the rail. The content box because,
> as mutation found, a check against the border box or `scrollWidth` passes an option that
> has run into the selector's 8px padding — as large as the defect itself. Mutations, each
> failing the test: the old `p-2`; labels forced onto one line; the last option nudged
> 12px right; a 250px rail; and a 253px rail, which fails only with "Medium 7x7" selected,
> as the measurement predicts. Every baseline containing the selector was retaken.

**The generated icons are exempt from the screenshot half**, and deliberately: they never
appear on a page. Their visual gate is stronger than a baseline already — rows 20b and 20h
assert the committed bytes are identical to the generator's output, that the same drawing is
produced at every size, and that the maskable mark's furthest painted pixel lies inside
r = 0.4. A page screenshot could not see any of that.

### P0-5 · The palette, in one place and in every consumer

**Problem.** §1.2, as measured by row 5's audit: **71 literals in 20 files**, in four
vocabularies (hex, Tailwind's palette, CSS named colours, and the icon's byte triples);
more blues than roles for them; one already-drifted pip.

**Shape.** One TypeScript module, `app/palette.ts`, of role-named tokens (`tileFace`, not
`cream`), consumed by four kinds of consumer — the fourth is the one that already exists
and is easy to forget:

1. **SVG components** import it directly.
2. **`scripts/icon.ts`** imports it directly — it runs in Node at build time, which is why
   the palette must be plain TypeScript with no React or CSS dependency.
3. **CSS and Tailwind** cannot import TypeScript, so the custom properties are
   **generated** by `npm run tokens` into their own file, `app/palette.css`, which
   `globals.css` imports, and committed. It is the pattern rows 20b/20h used for the icons,
   and it fails the same way: a test asserts the committed file is byte-identical to what
   the generator produces. `globals.css` holds no colour of its own.
4. **`siteMetadata.ts`** — `GROUND` feeds the viewport `themeColor` and the manifest's
   `theme_color` and `background_color`. It stops holding its own copy and reads the token,
   so a palette change reaches the browser chrome and the installed splash screen without
   anyone remembering to go and look.

Semantic colours are named for meaning (`success`, `problem`, `hint`) and are separate from
the interactive accent, per §2.2. `lineLabel.ts` keeps its semantics and sources its values
from here.

**Acceptance.**

- A literal audit (`tests/palette.test.ts`) **scoped to visual source**:
  `app/**/*.{ts,tsx,css}`, `scripts/icon.ts` and `scripts/palette-css.ts`. It is **blind to
  nothing that carries colour**:
  - `#rgb`/`#rrggbb` (with alpha forms);
  - colour functions: `rgb()`, `rgba()`, `hsl()`, `oklch()` and the rest;
  - the CSS named colours, including `black` and `white`;
  - Tailwind colour utilities in both forms (`bg-red-700`, `text-amber-100`,
    `bg-[#419dc8]`), under any variant;
  - arrays of three or four integers in 0–255, the form the icon held its palette in.

  The scope keeps content hashes and corpus data elsewhere in the repository from raising
  false positives. The breadth keeps `black`, `red-700` and `[0xe8, 0xe7, 0xe7]` — all live
  before row 5 — from escaping a hex-only pattern. Comments are not colour and are not
  reported.

  Only `app/palette.ts` and the byte-checked `app/palette.css` may hold a colour. Every token
  must be read by code, not merely named in a comment.
- **Contrast is computed from the tokens** (`tests/contrast.test.ts`) for every pair in §4 and
  §6, so the guarantee survives a palette change instead of being re-typed beside it.
  - §4's pairs must hold, at the values §4 quotes.
  - §6's pairs record whether they hold today. A row that makes one hold has to mark it
    held, and a held pair that breaks fails.
  - `tests/lineFeedback.test.ts` keeps its label checks, including that the *old* palette
    fails, and now reads the ground from the token.

> **Amendment (row 5) — what was built, and what it measured.**
>
> **The scope was three times §1.2's estimate.** The audit, run over the tree as it stood
> before this row, finds **71 colour literals in 20 files**, not "roughly twenty across nine":
> 29 hex, 30 Tailwind palette utilities (`bg-amber-200`, `ring-sky-600`, `bg-white/20`),
> 8 CSS named colours, and 4 byte triples — `scripts/icon.ts` held its palette as
> `[0xe8, 0xe7, 0xe7]`, which no string pattern sees. §1.2's table covered the hex and
> missed most of the rest: the archive, the day banner, the tutorial and every selection
> overlay were Tailwind's palette.
>
> **The palette.** `app/palette.ts`: 45 role-named tokens, plain TypeScript with no imports.
> 31 are the hex their use sites held. 14 came from Tailwind's palette and carry Tailwind's
> own `oklch()` definitions, so they render as they did; their doc comments name what they
> replaced, as provenance for P1-4, which folds the blues into one accent. `success`,
> `problem` and `hint` are their own tokens, separate from `accent` (§2.2); `hint` and
> `success` share a value today and not a role. The archive's error text is `alert`
> (Tailwind `red-700`), not yet `problem` — merging them changes a colour, which this row
> does not do.
>
> **Deviation: the generated CSS is its own file,** `app/palette.css`, imported by
> `globals.css`, rather than a generated region inside `globals.css`. The byte-identity check
> is then whole-file, exactly as for the icons, with no markers inside a hand-edited file.
> `globals.css` now holds no colour at all. `npm run tokens` writes it
> (`scripts/palette-css.ts` renders, `scripts/tokens-write.ts` writes — the icons' split, for
> the icons' reason). It declares each token twice: `--tile-face` in `:root`, and
> `--color-tile-face: var(--tile-face)` in `@theme inline`, so Tailwind utilities
> (`bg-tile-face`, `bg-on-accent/20`) read the property instead of copying the value.
> `.gitattributes` marks the file `-text`: under `core.autocrlf=true` a checkout would
> rewrite its LF endings and fail the byte check on every Windows clone, as happened to the
> corpus.
>
> **The four consumers:** the SVG pieces, `LevelSelector` and `BoardSquare` import
> `PALETTE`; `scripts/icon.ts` reads bytes through `rgbBytes`; CSS and Tailwind read the
> generated file; `siteMetadata.GROUND` is `PALETTE.ground`. `lineLabel`'s three states read
> `lineNeutral`, `success` and `problem`.
>
> **The pip drift, resolved toward the board.** The board's `black` won over the icon's
> `#1a1a1a`: the icon is a picture of the board, not the reverse, and so no page pixel
> moves. The four icons were regenerated. Decoded and compared, the only pixels that changed
> are pip pixels, `#1a1a1a` to `#000000`: 646, 4,639, 2,259 and 571 at 192, 512, maskable 512
> and 180. The icon test's maskable-reach check found "background" by the literal bytes
> `e8 e7 e7`; it now uses the `ground` token, because P1-3 requires that test to pass
> *unaltered* after the ground moves, and with the literal it could not have. Recorded, not
> fixed: the icon's tile body is `tileSide`, the extrusion colour, not `tileFace`. It always
> was, and P2-4 redraws the icon.
>
> **Nothing on screen changed — measured, beyond the four baselines.** The baselines
> cover the board, the controls and the sheet, but not the archive, the day banner or the
> tutorial, which is where most of the Tailwind colours were. So a harness read the computed
> `color`, `background-color`, `background-image`, all four border colours, `outline-color`
> and `outline-style`, `fill`, `stroke`, `box-shadow`, `text-decoration-color`,
> `caret-color` and `opacity` from **every element** in 40 states:
> - the phone and desktop game, fresh, mid-play with an anchor and keyboard focus, with a
>   hint, after Check, and with a difficulty hovered;
> - the archive open, and the day banner;
> - the tutorial, with its disabled button hovered, which tests `cn`'s merge of the renamed
>   classes;
> - both sheets, with each of their 11 buttons hovered.
>
> That is 10,735 elements, compared before and after. Two runs before the change were
> identical to each other, once the harness waited out `motion`'s colour animations (the
> row-4 rest check covers opacity and transform, not colour). The run after the change was
> identical to them. As a positive control, shifting `tileFace` by one level in one channel,
> and two `oklch()` tokens in their last digits, changed all 40 dumps. The harness is a
> measurement, kept out of the repository like row 4's sensitivity harness. The visual job
> is the second witness: this row regenerates no baseline, and they must still match at
> threshold 0.
>
> **The audit** (`tests/palette.test.ts`, scanner in `tests/colourAudit.ts`). It reads
> TypeScript as a syntax tree, not as text. Comments are not colour — this codebase's
> comments quote old literals on purpose, as the record — and only the tree can tell a
> comment from a string. Every string literal, template piece and JSX attribute value is
> scanned for hex, colour functions, the 148 CSS named colours and Tailwind palette
> utilities under any variant. So is every array literal of three or four integers in
> 0–255. JSX text is copy a player reads, and is skipped. CSS is scanned with its comments
> removed. `transparent` and `currentColor` carry no colour and are not reported.
>
> The scope is `app/**/*.{ts,tsx,css}`, `scripts/icon.ts` and `scripts/palette-css.ts`.
> Only `app/palette.ts` and the byte-checked `app/palette.css` may hold a colour. Two more
> checks go with it:
> - Every token must be read by something. An unread token can drift as silently as a
>   literal. "Read" means read in code. As first committed (`765e575`) this check searched
>   raw source, so `// PALETTE.ghost` counted as a consumer of an otherwise unused token
>   (codex's review). It now blanks comments first, from the syntax tree: leading and
>   trailing comment ranges of every token, with ranges inside JSX text left alone. A test
>   names the token only in comments (`//`, `/* */`, JSDoc, same-line trailing, JSX's
>   `{/* */}`, CSS) and requires it unread. The same names in code, including after JSX
>   copy containing `//`, must count as reads. Mutations, each caught:
>   - a new token named only in a `//` comment, only in a JSX comment, and only in a
>     same-line trailing comment, all in real components;
>   - the check reverted to raw source;
>   - trailing ranges dropped;
>   - the JSX-text guard dropped.
> - The palette itself must import nothing, because `npm run icons` loads it in Node.
>
> **Contrast** (`tests/contrast.test.ts`, maths in `tests/colour.ts`). The maths reads hex
> and `oklch()`, and composites translucent colours. It is checked against white, CSS
> Color 4's reference red, and 21:1 for black on white. §4's four text pairs are asserted
> at 4.5:1 and at the values §4 quotes (5.17, 5.77, 6.76, 14.53), which the tokens
> reproduce exactly. §6's pairs are the art rows' bars, and most do not hold yet. So each
> records whether it holds now, and the test requires exactly that. A pair its row fixes
> fails until the row marks it held; a held pair that breaks fails as a regression.
>
> | pair (3:1 bar) | today | owed by |
> | --- | --- | --- |
> | tile face on light / dark checker | 1.47 / 2.08 | P1-1, P1-3 |
> | rock face on light / dark checker | 2.24 / 1.59 | P1-2, P1-3 |
> | anchor on dark checker | 2.29 (light: 3.24, holds) | P1-5 |
> | candidate edge on light / dark checker | 1.63 / 1.15 | P1-5 |
> | outline on either checker; pip, divider, outline on the face; rock on the face; hint; focus at 70% | 3.10–19.04 | holds |
>
> `tests/lineFeedback.test.ts` now reads the ground from the token as well.
>
> **Mutations,** each run against `tests/{palette,contrast,icons,lineFeedback,siteMetadata}`
> and each failing it:
> - a literal reinserted in each vocabulary: hex in a JSX attribute, a Tailwind utility,
>   `stroke="black"`, hex in `globals.css`, a byte triple in the icon, `hover:bg-white/30`,
>   and `rgb()` in an inline style;
> - `palette.css` edited by hand;
> - a token edited without regenerating;
> - an unread token;
> - `GROUND` as its own literal;
> - a line label reading the wrong token;
> - an invariant's value moved;
> - an owed pair made to hold without being claimed;
> - a held pair broken.
>
> The negative control: comments quoting a colour in all four forms are not reported.
>
> Also: `BoardSquare`'s local `isDark` was the test for `(i + j)` even, and it picked the
> *lighter* tone. Beside token names it read as a bug, so it is `isEven` now.

### P0-6 · One geometry module, in cell units

**Problem.** §1.1: pixel constants inside scalable art.

**Shape.** The pieces draw in a **normalised coordinate system** — a `viewBox` measured
against the cell, at **53 units to a cell** (see the amendment for why not one) — scaled
once at the outer element by `squareSize`. The drawing is then expressed in the units the
design thinks in, and the only pixel values in a piece are the outer `width` and `height`
(and the lift that goes with them), all from one function, `pieceBox`.

**What this does to the baselines**, stated precisely, because the obvious claim is false.
Today's constants were chosen at roughly 53px. Turning them into fractions *of the cell*
therefore leaves 53px alone and necessarily changes every other size — the 38px sheet, the
phone page, and the desktop page at its new ≥56px cell. "All four baselines unchanged" would
be a contradiction, not a standard.

**Acceptance.**

- **Baseline 2 (53px) stays pixel-identical.** If sub-pixel rounding makes that impossible,
  the row names the attribute and the arithmetic rather than widening the diff budget.
  "Identical" has two meanings here, and the row proves each where it can be proven:
  - **By the suite's comparator, on CI.** The new code is compared against the unchanged
    53px baseline at `threshold: 0`, `maxDiffPixels: 0`. That is equality as pixelmatch
    defines it, which ignores pixels it classifies as anti-aliasing (P0-4). It is not
    literal byte identity, and CI cannot attest that: two runs of the same code on the
    runner differ in raw pixels (14 on the target specimens at row 6).
  - **In raw pixels, on one machine, controlled.** Old and new code are each rendered
    repeatedly on the development host, and the two sets of images must be the same set.
    Run-to-run noise then shows up on both sides, and a code change on one.
- **Baselines 1, 3 and 4 change**, and each change is *predicted before it is taken*: the new
  value of every constant equals the old one times the cell ratio, within rounding, and the
  geometry assertions from P0-2 are rewritten to assert the ratio rather than the pixel.
- A unit test renders each piece at 38, 53, 75 and **106** and asserts every geometric
  attribute scales linearly within rounding. *(106 amended in row 2: it is the widest
  shipped cell since P0-1, and a scaling test that stops at 75 would leave nearly half of
  the real range unproven.)*
- The geometry-literal rule, stated narrowly enough to enforce: *no literal denominated in
  CSS pixels may appear in the drawing.* Literals inside the normalised `viewBox` are the
  design and are expected — the rule is about units, not about numbers.

> **Amendment (row 6) — the unit, measured; and the predictions, before the baselines.**
>
> **What was built.**
> - `app/dominoFill/Pieces/geometry.ts` holds every length of the drawing in units of the
>   cell: `PIECE` (outline 6, radius 8, pip radius 8, divider inset 16 and width 3,
>   extrusion 16, inset 4, entry 26), `UNIT = 53` to the cell, `fraction(units)`,
>   `viewBox(across, down)`, and `pieceBox(across, down, cell)`.
> - `pieceBox` is the only place pixels enter. It sets the svg's `width` and `height`, and
>   its lift (`translate: 0 -extrusion`), which was the fixed `-translate-y-4` class.
> - The entry offset in `Pieces.tsx` is `fraction(PIECE.entry)` of the cell, in place of a
>   fixed 26px.
> - A piece takes exactly `boardsStore` and, for the tray, `cellSize`: no SVG props. As
>   first committed (`c9a9e45`) each piece spread caller props onto its `<svg>` after
>   `pieceBox`, so a caller could override the width, height, style or `viewBox`. No caller
>   did, but that contradicted "the only place pixels enter" (codex's review). The spread is
>   gone and the types are narrowed. `tests/pieceGeometry.test.tsx` holds four
>   `@ts-expect-error` lines (width, style, class, viewBox), so re-widening the props fails
>   `tsc`. The geometry rule now rejects any spread on the `<svg>` other than `pieceBox(...)`,
>   before it or after it.
> - A dead prop went with it. `Pieces.tsx` passed `className="absolute z-30"` to the upright
>   domino, and the svg's own class, set after the spread, always overrode it. With the class
>   gone the prop would have started to apply, so it is removed rather than turned on.
>
> **Why 53 units to a cell, not one.** Built first with one-unit cells (`viewBox="0 0 1
> 2.30"`, lengths like 6/53), the 53px sheet was not pixel-identical. Chromium scales every
> coordinate by 53 and reaches the same shapes by a different floating-point path. **462
> pixels** of anti-aliased edge moved, up to 9 levels, identically on two runs; pixelmatch
> counts one of them. With 53 units to a cell, the 53px drawing is rendered at a `viewBox`
> scale of exactly 1. Measured on the development host, it is byte-identical to the old
> drawing, apart from an 8-pixel cluster that also toggles between two runs of the *old*
> code. The unit is still the cell's: a length's fraction of the cell is its value over
> `UNIT`, and every piece scales as one drawing.
>
> **The predictions**, written before CI takes the new baselines:
>
> | baseline | cell | predicted change |
> | --- | --- | --- |
> | 2, sheet at 53 | 53 | **none** — `viewBox` scale 1 |
> | 1, sheet at 38 | 38 | every length on every piece × 38/53 (outline 6 → 4.30, pip 16 → 11.47, divider 21 → 15.06, extrusion and lift 16 → 11.47); **nothing outside the pieces** |
> | 3, phone | 38 | the board's pieces as in 1; the legend tray's pieces at their 44px cell × 44/53, so the tray is 144 → 141.28px and **everything below it moves up** (page 726 → 723px) |
> | 4, desktop | 85 → **86** | the tray as in 3, and the 2.72px it gives back goes to the board, which is height-bound here: the 6x6 cell is **86**, not 85, so every cell, label and piece moves, and the pieces are drawn at 86/53 |
>
> The desktop cells were measured, not assumed: 85 → 86 (6x6), 74 → 75 (7x7), and 66 → 66
> (8x8). The phone's stay at 38, and the 106px cap does not move. This is the row's
> principle applied to the tray: its pieces are a drawing at a 44px cell, and a drawing
> that scales has a shorter extrusion there. The layout arithmetic is untouched (§3).
>
> **The prediction for 1, checked on the development host.** The 38px sheet's differing
> pixels were compared with the union of each piece's old and new drawing box (from 16px
> above the cell to the bottom of its cells, plus 1px of anti-aliasing). All **6,351** lie
> inside. A first "before" shot carried 5 more on the focus specimen, which has no pieces.
> Two fresh "before" shots of the old code did not, so that cluster was host noise in the
> first shot.
>
> **Baseline 2, both kinds of identical.**
> - **Comparator equality, on CI.** Part 2 (`288dc47`) deliberately kept row 4's
>   `sheet-53.png` rather than CI's regenerated one. That run compared the new code against
>   the old baseline at threshold 0 and passed (CI run 36017003760, on an Intel Xeon 8573C,
>   a different CPU from the one that took it). CI's regenerated copy differed from the
>   committed one in 14 raw pixels on the target specimens, none counted by the comparator.
>   One of them is on a cell with no piece, and the same values repeat in the next
>   specimen. That is runner noise, and it is why CI cannot attest byte identity.
> - **Raw identity, controlled, on the development host.** The 53px sheet was shot 15 times
>   with the pre-row-6 pieces (`ba596f9`) and 15 times with the new ones, one process at a
>   time, on one machine. Each side produced **the same three byte-identical images and no
>   others**: 10, 4 and 1 of them from the old code, and 12, 2 and 1 from the new. The three
>   differ from one another only in small clusters on the target specimens (8 to 29
>   pixels), which the old code produces as often as the new. On this host, at 53px, the
>   new drawing is the old one pixel for pixel. The only variation is noise both sides
>   share.
>
> **The assertions, rewritten from pixels to ratios.**
> - `tests/pieceGeometry.test.tsx`: at 53px every constant is exactly row 2's pixel value,
>   and the lift is new, at 16. At 38, 53, 75 and 106 each is the same fraction of the cell,
>   and §1.1's 2.79× and 4.42× swings are now 1.00×.
> - The same test reads **every geometric number the layer writes**: rect, line and circle
>   attributes through the piece's scale, each svg's box and lift, each piece's position, and
>   each entry offset. At 38, 75 and 106 each must be its 53px value times the cell ratio.
> - `e2e/art.spec.ts`: in the real build, each constant is its fraction of the measured
>   cell at 38 and 106. Inline CSS lengths read back (the lift and the entry offset) are held
>   to three places, the precision Chromium serialises them to (`11.4717px`); everything
>   else is held to six.
> - The geometry-literal rule is `tests/geometryRule.test.ts`, over each piece's syntax tree:
>   - one `<svg>`, with a `viewBox`, taking its box from `pieceBox`, and setting no width,
>     height, class or style itself;
>   - inside it, no reference to the cell size in px (`size`, `cellSize`, `squareSize`,
>     `boardsStore`), no `px` or `translate-` string, and no class or style.
>
>   Its positive controls cover each breach.
>
> **Mutations,** each run against `tests/{pieceGeometry,geometryRule}` and each caught:
> - a stroke width back in px from the cell size;
> - the lift back to a fixed class;
> - the lift a fixed 16px;
> - the entry offset a fixed 26px;
> - the outline moved from 6 to 7 units, which is what P1-1 will do, but announced;
> - the `viewBox` a unit wider than the cell;
> - one rock's width back to `size - 12`;
> - `pieceBox` leaving the extrusion out of the height.
>
> The last passed every scaling check, because the readers take a piece's scale from its
> width and the browser would squash the drawing to fit. An assertion that each svg's box
> has its `viewBox`'s proportions, at every size, now catches it.

---

## 6. P1 — the art

### P1-1 · Proportions that hold at 38px

Retune the fractions from P0-6 against the **38px** rendering, per §2.1. The values are the
row's to choose; these bounds are not.

- Every fraction is constant across cell sizes (±1px rounding) — P0-6's test still passes.
- **Divider span ≥ 0.55 of the tile's width** at every cell size (today: 0.158 at 38px).
- **Pip diameter 0.18–0.30 of the cell**, with a clear margin of **≥0.06** to both the
  divider and the tile edge, at every cell size.
- **Outline weight ≤ 0.12 of the cell**, constant.
- **Extrusion depth 0.10–0.18 of the cell**, constant — "slightly exaggerated", not half a
  cell (today: 0.421 at 38px).
- **Contrast, computed from the tokens, every pair that carries information:**

  | Pair | Minimum | Why |
  | --- | --- | --- |
  | tile face : each checker tone | 3:1 | the piece against the board |
  | pip : tile face | 3:1 | the pip *is* the score |
  | divider : tile face | 3:1 | it is what makes a domino a domino |
  | outline : tile face | 3:1 | the silhouette's own edge |
  | outline : each checker tone | 3:1 | the same edge, seen from outside |

- The cell's hit area is untouched: art may not change what `pointerUp` resolves.

> **Amendment (row 7) — the values chosen, one bar moved to P1-3, and the predictions.**
>
> **The values,** in `app/dominoFill/Pieces/geometry.ts`, now at **100 units to a cell** so
> each reads as a percentage of it. Row 6's 53 existed to keep the 53px baseline identical,
> and this row moves every length, so that reason is gone.
>
> | | bound | row 6 | row 7 |
> | --- | --- | --- | --- |
> | outline | ≤ 0.12 | 0.113 | **0.09** (3.4px at 38) |
> | extrusion | 0.10–0.18 | 0.302 | **0.14** |
> | pip diameter | 0.18–0.30 | 0.302 | **0.24** |
> | divider span / the tile it crosses | ≥ 0.55 | 0.47 flat, 0.51 upright | **0.68** both |
> | pip clearance to divider and tile edge | ≥ 0.06 | 0.05 (flat, top edge) | **0.108** at the tightest |
> | corner radius | — | 0.151 | 0.14 |
> | divider weight | — | 0.057 | 0.05 |
> | margin to the cell edge | — | 0.075 / 0.113 | 0.06 |
>
> Row 6 carried the old art's inconsistencies: the upright domino and the rock drew their
> face 6 units in, the flat domino 4, and the outline elsewhere again. All three pieces now
> share one scheme: face, side and outline on the same box, inset by `inset`, with the side
> shifted down by the extrusion. The entry offset is P1-6's to limit and keeps row 6's
> fraction.
>
> **The bounds are asserted, not the values** (`tests/proportions.test.tsx`). Each is
> measured from the real piece layer's markup at 38, 53, 75 and 106px:
> - outline weight, extrusion and pip diameter as fractions of the cell;
> - the divider's span over the face side it crosses;
> - each pip's clearance to the divider's stroke, and to the visible face: inside the
>   outline stroke, and at the face's own bottom edge, where the side begins and there is
>   no stroke.
>
> Row 6's art fails four of them: pip, extrusion, divider span, and the flat pips' 0.05 from
> the top edge. `tests/pieceGeometry.test.tsx` moves its written-out anchor to these values,
> at a 100px cell, and keeps every row-6 scaling check.
>
> **The hit area,** in `e2e/art.spec.ts` at 38 and 106px, with every kind of piece on the
> board. `elementFromPoint` must resolve each of the 36 squares at its centre, 2px inside
> the middle of each edge (where the pieces stand over the square above), and 5px inside
> each corner (the board's outer squares are rounded by 12px).
>
> **Mutations,** each caught:
> - pip diameter 0.32;
> - extrusion 0.19;
> - outline 0.13;
> - divider 0.545 of the tile;
> - flat pips moved to the quarters;
> - a divider heavy enough to crowd the pips;
> - row 6's art restored whole;
> - the piece overlay taking the pointer, caught by the hit-area check.
>
> **Deviation: "tile face : each checker tone ≥ 3:1" is not met here, and moves to P1-3.**
> It is 1.47 and 2.08 today, and no proportion can change it. The only lever is colour, and
> the face cannot supply it: even pure white reaches only 1.62 and 2.30 against today's
> checker tones. Meeting it means darkening the checkerboard well past what it is. The
> checker tones are P1-3's ("the checkerboard tones … every contrast guarantee is
> recomputed from the tokens in the same commit"), and P1-3 already requires both tones to
> clear 3:1 against the tile face. Changing them here would do half of P1-3 early and
> without its ground. `tests/contrast.test.ts` records the pair as owed by P1-3. The other
> four pairs in the table already hold: outline on either tone 12.94 and 9.14; pip, divider
> and outline on the face 19.04.
>
> **The predictions**, before CI takes the baselines. Every baseline changes, because every
> piece is redrawn:
> - **1 and 2, the sheets:** only the pieces.
> - **3, phone:** the board cell stays 38. The legend tray's pieces lose extrusion at their
>   44px cell, so the tray is 141.28 → 134.16px and the page 723 → 716px, with everything
>   below the tray moving up.
> - **4, desktop:** the tray the same. The height it gives back grows the height-bound board
>   again: 6x6 86 → **87**, 7x7 75 → 76, and 8x8 66 → 67. Measured, like row 6's.
>
> **Checked, for the sheets.** On the development host, both with the
> `--disable-partial-raster` switch P0-4 now uses, the old art (`794bd19`) and the new were
> compared. Every changed pixel lies inside a piece's old or new drawing box: **7,204 of
> 7,204** at 38px and **13,115 of 13,115** at 53px, with nothing elsewhere. Without the
> switch, rows 6 and 7 each had a noise cluster to explain away; with it there is none.

### P1-2 · An irregular, faceted rock (§1.4, §2.1)

**Acceptance.**

- The rock's silhouette **deviates from a rounded rectangle by ≥0.05 of the cell at three or
  more points**, asserted from the path rather than judged by eye.
- Legible at 38px; ≥3:1 against both checker tones and against the tile face.
- `cellDescription`'s wording from row 19 is unchanged — the picture changes, the name does
  not.
- Covered by baselines 1 and 2, which is the kind of silhouette question geometry alone
  cannot settle.

> **Amendment (row 8) — the rock drawn, "a rounded rectangle" read, and what is proved
> versus searched.**
>
> **The rock** (`ROCK` in `app/dominoFill/Pieces/geometry.ts`, drawn by `Rock.tsx`) is a
> faceted boulder:
> - its extremes sit on the inset box every piece shares;
> - its top carries the irregularity: a shoulder, a notch, an off-centre peak; its base is
>   nearly flat;
> - its extrusion is the face swept down by `extrusion`, which for a shape whose top and
>   base are each a function of x is the top chain followed by the base shifted down. That
>   swept outline is the silhouette: the side is filled with it and the outline strokes
>   it, with round joins;
> - two facets, a lit plane across the crown and a shaded plane down the right, are flat
>   tones over the face's own, with no inner strokes and no gradients (§2.1).
>
> It has no `rect`, so no corner radius: row 2's table counts 6 radii where it counted 9.
> The shared reader (`e2e/artGeometry.ts`) now measures extrusion bottom to bottom, which
> for a domino's rects is the same as top to bottom and for the rock is the only reading
> that works, since its side's top is the face's own.
>
> **How the bar is read.** "Deviates from a rounded rectangle" is read against the
> rounded rectangle that fits the silhouette **best**, with any size, corner radius,
> position and rotation. Against one fixed rectangle, a smaller rounded rectangle would
> pass, and so would the domino's own shape moved by a twentieth of a cell. "At three or
> more points" is read as three points of the outline, pairwise at least a quarter of a
> cell apart along it, so one nick counts once. A single feature long enough to hold two
> such points counts twice: it deviates along more than a quarter cell of outline. The
> outline is sampled at equal arc-length steps, and every sample is a point of the
> silhouette (`tests/roundedRect.ts`).
>
> **What is proved and what is searched** (`tests/rock.test.tsx`, on the outline read from
> the rendered piece layer and divided by the cell):
> - **Exhaustive,** at 38, 53, 75 and 106px: every axis-aligned rounded rectangle on the
>   silhouette's own bounding box, at every corner radius. The radius is gridded, and the
>   most a radius between grid points could change the answer is subtracted. Certified
>   bound: **0.154** at every size. The domino's silhouette on a cell, which the rock used
>   to be, is in this family and is also checked on its own: **0.163**.
> - **Searched,** at 38px: all six parameters, by Nelder-Mead from 36 starting rectangles,
>   each refined. Closest fit found: **0.0747**, rotated by about 20°.
> - **Not proved:** a branch and bound over all six parameters, on the same Lipschitz
>   argument as the family check, did not finish in 50 million boxes. What stands behind
>   the search instead is agreement with a separate, far heavier search: 3,000 random
>   starts, each refined by a pattern search, at twice the sampling, which found
>   **0.0757**. The test holds the search to that witness: it must come at least as close.
>   A search that stops short would overstate the deviation and make the rock pass more
>   easily, and only the witness can see that.
> - **The search's other direction:** four shapes that are rounded rectangles, or one
>   spike away from one, must come out under the bar. These are the domino's silhouette;
>   a smaller rounded rectangle, off-centre; the domino turned by 20°; and a rounded
>   rectangle with a spike. The family check must also fail the domino.
>
> **Contrast.** Every rock tone clears 3:1 against both checker tones and the tile face,
> so the rock is now dark. With today's checker, 3:1 against the darker tone needs a
> luminance under about 0.10.
>
> | token | on checkerLight | on checkerDark | on tileFace |
> | --- | --- | --- | --- |
> | `rockFace` `#46423e` | 6.14 | 4.34 | 9.03 |
> | `rockLit` `#5a5550` | 4.54 | 3.21 | 6.68 |
> | `rockShade` `#35322f` | 7.85 | 5.55 | 11.55 |
> | `rockSide` `#24221f` | 9.78 | 6.91 | 14.39 |
>
> The pair P0-5's amendment recorded as owed by P1-2 and P1-3 (rock face on the checker,
> 2.24 / 1.59) now holds. `tests/contrast.test.ts` holds all twelve pairs. P1-3 moves the
> checker and owns the recomputation. Darkening the checker enough to clear the tile face
> will tighten the rock's bar in turn, most for `rockLit`.
>
> **Legible at 38px** is evidenced three ways:
> - by the contrast above;
> - by the silhouette bar measured at 38px, where 0.05 of the cell is 1.9px;
> - by baselines 1 and 2, where a column of two rocks (the `target-satisfied` fixture) now
>   reads as two rocks.
>
> **The name.** `cellDescription` still says "rock". The whole string is now pinned in
> `tests/cellLabel.test.ts`, and `cellLabel.ts` is unchanged since row 19 (`3a803d5`).
>
> **In the browser** (`e2e/art.spec.ts`, at 38 and 106px, every one of the day's rocks):
> - the committed path, on the side and the outline;
> - the four tones in drawing order;
> - no `rect`;
> - the outline's bounding box, from Chromium's own `getBBox`;
> - `isPointInFill`, which says that two corners of the old rounded rectangle, and the
>   notch, are empty.
>
> `e2e/board.spec.ts`'s check that every decorative outline is `fill="none"` selected
> `rect[data-outline]`. It would have found no outline on the rock and checked nothing
> there, so it now selects any outline shape.
>
> **The predictions.** All four baselines change, and only inside the rocks' boxes: no
> box, size or layout moves. The phone page stays 360×716, and the desktop's 6x6 cell stays
> 87. Checked on the development host, with the switch P0-4 uses, old art (`d2282c1`)
> against new:
>
> | baseline | rocks | changed pixels | outside a rock's box |
> | --- | --- | --- | --- |
> | 1, sheet at 38px | 3 | 4,024 | 0 |
> | 2, sheet at 53px | 3 | 7,817 | 0 |
> | 3, phone | 8 | 10,827 | 0 |
> | 4, desktop | 8 | 54,046 | 0 |
>
> Every rock changed, and two shots of each state were identical.
>
> **Mutations,** each caught:
> - the old rounded-rectangle rock restored;
> - the rock drawn as a rounded-rectangle polygon;
> - the lit facet lightened, and the side lightened, each past 3:1;
> - a facet point off the face;
> - the side filled with the face instead of the swept silhouette;
> - the base swept by less than the extrusion;
> - the rock renamed;
> - the separation ignored;
> - the search cut to five iterations, caught by the witness;
> - in the browser: the old rock, lit and shade swapped, the outline painted `transparent`,
>   and the notch filled in. The notch is caught by `isPointInFill` alone, since a shallower
>   notch still clears the unit bar.
>
> Two weakened searches **survive**, and are recorded rather than hidden: one starting
> radius instead of four, and no rotated starts. Each still reaches the witness (0.0755,
> both), so on this shape they are not measurably weaker.

### P1-3 · A warmer board, on a warmer ground

The checkerboard tones, the frame — whose 16px radius does not match the cells' 12px corner
— the target labels, which float beside their lines with no visual tie, and **the ground
itself**: `#e8e7e7` becomes a subtly warm off-white.

The ground is the expensive part, and it is deliberately all in this one commit. Every
contrast ratio in §4 and §6 is measured *against* it; `siteMetadata.GROUND` feeds the
browser chrome's `themeColor` and the manifest's `theme_color` and `background_color`; and
`scripts/icon.ts` paints its background with it, so the committed icons stop matching their
generator the moment it moves.

**Acceptance.**

- The ground changes and **every** contrast guarantee in §4 and §6 is recomputed from the
  tokens in the same commit. A ratio that no longer clears its bar is fixed here, not
  deferred.
- `npm run icons` is rerun in this commit and rows 20b/20h's tests pass unaltered —
  byte identity, PNG header, same drawing at every size, maskable mark inside r = 0.4.
- The manifest and the page still agree, which row 20f's served-against-served test already
  checks; it must pass without being edited.
- Frame inner radius and cell corner radius agree **by construction**, from one token.
- The two checker tones differ by a stated ratio, and both clear ≥3:1 against the tile face
  and the rock.
- The target-to-line tie is a measurable geometric or tonal relationship, asserted as such.

### P1-4 · Quieter controls, louder meaning (§2.2)

**Acceptance.**

- The accent token appears on interactive chrome only; `success`, `problem` and `hint` are
  their own tokens and appear only on the states they name — asserted by computed style, per
  control, per state.
- Three blues become one accent. `LevelSelector`'s labels, roles and destination wording are
  untouched.
- Hierarchy is evidenced by the token-role assertions above **and** by baselines 3 and 4.
  There is deliberately no "the board's maximum chroma exceeds the controls'" test: one
  saturated pixel would satisfy it while the controls still dominated the page, and a test
  that can be satisfied without the claim being true is worse than no test.

### P1-5 · The persistent cell states, legible at the floor

Anchor, candidate, hint and focus — the states a player reads while thinking, all of which
hold still long enough to sit on a static sheet. The hint is a 3px `#15661a` outline inset
2px today: a tenth of a 38px cell, competing with a 6px piece outline.

Rejection is **not** here. It is motion, and it belongs to P1-6.

**Acceptance.**

- Each state is distinguishable from every other at 38px, **and from every other without
  colour** — P1-8's requirement, not a new one, so each carries a second channel.
- Each state's indicator is a fraction of the cell, not a pixel constant.
- ≥3:1 against both checker tones. All four appear on baselines 1 and 2.

### P1-6 · Motion, and the states a control owes

The entry offset is 26px — 68% of a phone cell. There are zero CSS transitions, so nothing
acknowledges a press before its result arrives. And rejection is currently a shake and
nothing else.

**Acceptance.**

- Motion offsets and squash amplitudes are fractions of the cell; **amplitude ≤0.12**,
  **duration ≤200ms** for placement feedback.
- **Rejection has a static equivalent, defined here and then tested.** Row 13 first
  *measures* whether `MotionConfig reducedMotion="user"` suppresses the imperative shake; if
  it does, a player who asked for reduced motion currently gets no visual answer to a refused
  move at all, and this row owes them one that does not animate. Only once that equivalent
  exists may rejection appear on a reduced-motion screenshot.
- **The control-state contract**, complete rather than "hover and press":
  - `:focus-visible` on every interactive control, meeting the same non-colour requirement
    as the cell states;
  - an active/pressed treatment on every control;
  - a **toggle state** — `aria-pressed` reflected visually by a non-colour channel as well
    as a coloured one, on every control that can be pressed *into* a state rather than
    merely pressed (the difficulty selector, `Sound`);
  - a disabled treatment that keeps its current contrast (`Undo` is disabled on arrival);
  - **hover only under `@media (hover: hover) and (pointer: fine)`** — a hover style that
    latches on a touch device is a control that looks pressed until you press something
    else.
- **Reduced motion covers CSS too.** `MotionConfig` governs `motion/react` only; any new CSS
  transition or animation needs its own `@media (prefers-reduced-motion: reduce)` rule.
  Asserted under `emulateMedia({ reducedMotion: 'reduce' })`: computed `transition-duration`
  and `animation-duration` are `0s` on every element that has one — and non-zero without it,
  or the assertion proves nothing.

---

## 7. P2 — polish

### P2-1 · Typography, as roles

One declaration of the family (the vestigial `Arial` body rule goes), and a named role per
text surface rather than `text-sm` scattered across components. The board's labels already
derive from the cell via `LABEL_FONT_FRACTION` and keep doing so.

| Role | Size | Line height | Used by |
| --- | --- | --- | --- |
| board label | `LABEL_FONT_FRACTION` × cell | 1 | `HorizontalNumbers`, `VerticalNumbers` |
| card title | 24px | 1.25 | `CompletionCard` |
| control | 16px | 1.25 | every button and toggle |
| body | 14px | 1.5 | `AdviceStrip`, `Tutorial`, `DayBanner` |
| meta | 12px | 1.5 | archive dates, secondary notes |

**Acceptance.** Every text surface resolves to one of these five roles and to one family,
asserted by computed style; no component declares a size outside the table.

### P2-2 · One control vocabulary

`Check`/`Hint`/`Undo`/`Reset` are flat grey; `Archive` and `Sound on` are bordered white.
Same class of control, two designs. The variants, enumerated:

| Variant | Who | Treatment |
| --- | --- | --- |
| primary | `Check` | accent surface, strongest weight |
| secondary | `Hint`, `Undo` | neutral surface, accent on focus and press |
| caution | `Reset` | the `problem` token as an edge, not a fill |
| quiet | `Archive`, `Sound` | bordered, no fill until interacted with |
| icon | `LevelSelector`'s arrows | accent stroke, label unchanged |

**Pressed is a state, not a variant.** The difficulty selector and `Sound` are toggles, but
so could any control be; `aria-pressed` is something a control *is*, alongside focus,
hover and disabled, and it belongs in P1-6's state contract where those live. A row of the
table for it would have made one control's state another control's identity.

**Why `Reset` leaves the secondary group.** It is the only control that destroys work, and
`SPEC.md` leaves its lack of a confirmation step open. A cautionary treatment makes the
button look like what it does; it does **not** answer that open question, and this row must
not be read as having closed it.

**Acceptance.** Surface, radius, padding and the states from P1-6 come from tokens per
variant; every control belongs to exactly one variant, asserted by computed style; `Reset`
is visually distinct from `Hint` and `Undo` by a named property, not by fill alone; disabled
contrast is unchanged from today's measurement.

### P2-3 · The completion card

The game's one celebration, and currently a blue box. Its hierarchy, specified: the outcome
line is the loudest thing in the card (`card title` role, `success` token), the detail line
is `body`, and the actions are `secondary` controls beneath both. Motion stays inside P1-6's
limits.

**Acceptance.** The three levels are distinguishable by size *and* weight, asserted by
computed style; the card's copy, `role="status"` and focus behaviour are unchanged from
row 15; it appears on **baselines 1 and 2**, as a fixture on the component sheet, because it
is a transient surface and the desktop baseline is the ordinary composition.

### P2-4 · The icon, brought up to the new art

The colours are already done: P0-5 took every literal out of `scripts/icon.ts`, and P1-3
moved the ground and regenerated the files with it. What is left is the *drawing*. The icon
is a domino in the game's own palette, and after rows 7 through 12 the game's domino is a
different shape — different outline weight, different corner radius, different pip, a
divider that spans the tile. An icon that keeps the old proportions is the same drift as the
pip, one step further out: the launcher would show a game that no longer exists.

**Acceptance.**

- The icon's mark uses the same fractions as the board's piece where they apply — outline
  weight, corner radius, pip diameter, divider span — so parity is asserted against P1-1's
  constants rather than judged by eye.
- `npm run icons` regenerates every file, including the maskable variant.
- Rows 20b and 20h's tests pass **unaltered**: byte identity with the generator, the PNG
  header, the same drawing at every size, and the maskable mark's reach inside r = 0.4 —
  which is the constraint the new proportions have to live within, and the reason this row
  measures rather than assumes.
- No page screenshot is owed; see the exemption under P0-4.

---

## 8. Sequencing

One row, one commit — **except that a row which changes pixels is two**, from row 4 on.
Baselines are generated only on the CI runner (P0-4), and a workflow can be started by hand
only from the default branch, which has none; so the row's change is pushed with
`[visual update]` in its commit message, CI regenerates the baselines and uploads them as
the `visual-baselines` artifact, and a second commit adds exactly those files
(`gh run download`) and nothing else. The first commit's visual job compares against what
it has just generated; the second's compares against what was committed, and that run is
the row's visual verdict. A correction that changes pixels follows the same pattern. The
alternative — one commit per row, with temporary branches pushed to generate baselines —
has not been asked for. `[visual measure]` re-runs the comparison 25 times against the
committed set, for when the environment is in question.

The full gate — `tsc --noEmit`, `npm run lint`, `npm test` with empty stderr,
`npm run build`, `npm run test:e2e` — passes before each commit, verified from cold. The
visual comparisons are not part of the local gate and cannot be: only the CI runner's
result counts for them. Corrections are mutation-tested, and a deviation from this document
is either fixed or written into it, never carried silently.

| # | Row | Proves it |
| --- | --- | --- |
| 1 | **P0-1** desktop composition: breakpoint, larger board, the rail of §2.3 | E2E |
| 2 | **P0-2** geometry assertions for the art as it stands | unit + E2E |
| 3 | **P0-3** test-only sheet route over the real components; proven absent from the bundle | unit + E2E |
| 4 | **P0-4** four baselines on a plain `ubuntu-24.04` runner, no container; diff budget measured | E2E |
| 5 | **P0-5** palette module; generated CSS tokens; metadata consumer; scoped literal audit | unit |
| 6 | **P0-6** normalised `viewBox` geometry; baseline 2 fixed, 1/3/4 predicted | unit + E2E |
| 7 | **P1-1** proportions retuned against the 38px rendering | unit + E2E |
| 8 | **P1-2** the irregular, faceted rock | unit + E2E |
| 9 | **P1-3** warm ground and warmer board; every ratio recomputed; icons regenerated | unit + E2E |
| 10 | **P1-4** quieter controls; semantic colours for meaning | E2E |
| 11 | **P1-5** persistent cell states, legible at 38px and without colour | unit + E2E |
| 12 | **P1-6** motion limits; rejection's static equivalent; the control-state contract | unit + E2E |
| 13 | **P2-1** typography roles | E2E |
| 14 | **P2-2** one control vocabulary | E2E |
| 15 | **P2-3** the completion card | E2E |
| 16 | **P2-4** the icon's drawing brought to parity with the new piece art | unit |

Rows 1–6 are the gate. Row 1 comes first because baselines taken against a composition that
is about to change are baselines taken twice.

---

## 9. Decisions taken

Recorded so nobody re-opens them by accident, and so the reasoning survives the decision.

- **The art direction is settled** (§2.1): a cartoony evolution of the existing identity, not
  a redesign and not a new aesthetic.
- **Four baselines, final** (P0-4). Not a starting point to be argued up or down.
- **The rail's contents are settled** (§2.3): difficulty, navigation and Archive, the
  Check/Hint/Undo/Reset group, and Sound. The legend stays with the board.
- **The ground becomes a subtly warm off-white in P1-3**, and every contrast guarantee is
  recomputed in that same commit rather than trailing behind it.
- **Transient surfaces live on the component sheet, not on the page baselines** (P0-4).
  Baselines 3 and 4 are the ordinary compositions; the completion card is rendered
  deliberately as a fixture rather than by manoeuvring a full page into celebrating.
- **The generated icons owe no screenshot** (P0-4, P2-4). They never appear on a page, and
  rows 20b/20h already hold them to byte identity with their generator and to a measured
  maskable safe radius — a stricter gate than a baseline, not a weaker one.
- **Device-pixel alignment is not a row.** An earlier draft made whole-pixel geometry a P0
  requirement on the strength of §1.5's fractional origins. Integer CSS coordinates are not
  synonymous with crisp rendering, no crop here demonstrates blur, and the pinned baselines
  are the right instrument for deciding whether any exists. If one shows up, it earns a row
  then — on evidence, which is the standard every other row in this document is held to.
