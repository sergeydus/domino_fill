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

### P0-4 · Four deterministic baselines

**Shape.** Exactly four. This is settled, not a starting point:

| # | Baseline | Depends on the day? |
| --- | --- | --- |
| 1 | component/state sheet at **38px** | no |
| 2 | component/state sheet at **53px** | no |
| 3 | complete **360px phone** composition | yes — clock pinned |
| 4 | complete **desktop** composition | yes — clock pinned |

Baselines 3 and 4 are the **ordinary** compositions — a board mid-play, not a board
mid-celebration. Transient surfaces belong on the sheets, where they can be rendered
deliberately and one at a time: the completion card is a fixture in P0-3, not a state the
full-page baseline has to be manoeuvred into.

The full-page pair pins the date with `page.clock.install`, as `e2e/archive.spec.ts` already
does. The sheets must not.

**The pinned environment.** Rasterisation differs between the Windows machine this is
developed on and the Linux container CI runs in, so the comparison environment is part of
the test, not a detail of it:

- Comparisons run **only** in the official Playwright container, pinned by **image digest**,
  at the Playwright version in `package.json` — updating either is a deliberate commit that
  regenerates baselines.
- `deviceScaleFactor` is fixed explicitly; fonts are `next/font`-self-hosted, so no network
  font can vary a frame.
- `reducedMotion: 'reduce'` and a pinned clock, so no animation mid-flight decides a frame.
- `npm run visual:update` runs the same container. Baselines are never regenerated on a
  developer's host.
- `maxDiffPixelRatio` is justified by a measured flake rate — run the unchanged suite N
  times, record the observed maximum — not chosen to make the suite pass.

**Acceptance.** Two consecutive runs of the unchanged suite produce zero diff. And for every
row in §6 and §7: reverting that row's change fails **a named targeted assertion appropriate
to what it changed** — a geometry assertion, a computed-token assertion, an accessibility
state, or a motion contract — *as well as* its relevant screenshot. A screenshot is never the
only thing standing behind a row, and no row is asked for a geometry assertion it has no
geometry to make.

**The generated icons are exempt from the screenshot half**, and deliberately: they never
appear on a page. Their visual gate is stronger than a baseline already — rows 20b and 20h
assert the committed bytes are identical to the generator's output, that the same drawing is
produced at every size, and that the maskable mark's furthest painted pixel lies inside
r = 0.4. A page screenshot could not see any of that.

### P0-5 · The palette, in one place and in every consumer

**Problem.** §1.2: twenty literals, nine files, three blues, one already-drifted pip.

**Shape.** One TypeScript module of role-named tokens (`tileFace`, not `cream`), consumed by
four kinds of consumer — the fourth is the one that already exists and is easy to forget:

1. **SVG components** import it directly.
2. **`scripts/icon.ts`** imports it directly — it runs in Node at build time, which is why
   the palette must be plain TypeScript with no React or CSS dependency.
3. **CSS and Tailwind** cannot import TypeScript, so `globals.css`'s custom properties are
   **generated** by `npm run tokens` and committed — the pattern rows 20b/20h used for the
   icons, failing the same way: a test asserts the committed CSS is byte-identical to what
   the generator produces.
4. **`siteMetadata.ts`** — `GROUND` feeds the viewport `themeColor` and the manifest's
   `theme_color` and `background_color`. It stops holding its own copy and reads the token,
   so a palette change reaches the browser chrome and the installed splash screen without
   anyone remembering to go and look.

Semantic colours are named for meaning (`success`, `problem`, `hint`) and are separate from
the interactive accent, per §2.2. `lineLabel.ts` keeps its semantics and sources its values
from here.

**Acceptance.**

- A literal audit **scoped to visual source** — `app/**/*.{ts,tsx}`, `app/globals.css`,
  `scripts/icon.ts` — and **blind to nothing that carries colour**: `#rgb`/`#rrggbb`,
  `rgb()`/`rgba()`/`hsl()`, CSS named colours including `black` and `white`, and Tailwind
  colour utilities in both forms (`bg-red-700`, `text-amber-100`, `bg-[#419dc8]`). The scope
  keeps content hashes and corpus data elsewhere in the repository from raising false
  positives; the breadth keeps `black` and `red-700` — both of which are live today — from
  escaping through a hex-only pattern.
- `tests/lineFeedback.test.ts` already computes contrast from a luminance function and
  asserts the *old* palette would fail it; that check widens to every pair in §4 and §6,
  computed **from the tokens**, so the guarantee survives a palette change instead of being
  re-typed beside it.

### P0-6 · One geometry module, in cell units

**Problem.** §1.1: pixel constants inside scalable art.

**Shape.** The pieces draw in a **normalised coordinate system** — a `viewBox` in cell units
— scaled once at the outer element by `squareSize`. The drawing is then expressed in the
units the design thinks in, and the only pixel values in a piece are the outer `width` and
`height`.

**What this does to the baselines**, stated precisely, because the obvious claim is false.
Today's constants were chosen at roughly 53px. Turning them into fractions *of the cell*
therefore leaves 53px alone and necessarily changes every other size — the 38px sheet, the
phone page, and the desktop page at its new ≥56px cell. "All four baselines unchanged" would
be a contradiction, not a standard.

**Acceptance.**

- **Baseline 2 (53px) stays pixel-identical.** If sub-pixel rounding makes that impossible,
  the row names the attribute and the arithmetic rather than widening the diff budget.
- **Baselines 1, 3 and 4 change**, and each change is *predicted before it is taken*: the new
  value of every constant equals the old one times the cell ratio, within rounding, and the
  geometry assertions from P0-2 are rewritten to assert the ratio rather than the pixel.
- A unit test renders each piece at 38, 53 and 75 and asserts every geometric attribute
  scales linearly within rounding.
- The geometry-literal rule, stated narrowly enough to enforce: *no literal denominated in
  CSS pixels may appear in the drawing.* Literals inside the normalised `viewBox` are the
  design and are expected — the rule is about units, not about numbers.

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

### P1-2 · An irregular, faceted rock (§1.4, §2.1)

**Acceptance.**

- The rock's silhouette **deviates from a rounded rectangle by ≥0.05 of the cell at three or
  more points**, asserted from the path rather than judged by eye.
- Legible at 38px; ≥3:1 against both checker tones and against the tile face.
- `cellDescription`'s wording from row 19 is unchanged — the picture changes, the name does
  not.
- Covered by baselines 1 and 2, which is the kind of silhouette question geometry alone
  cannot settle.

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

One row, one commit. The full gate — `tsc --noEmit`, `npm run lint`, `npm test` with empty
stderr, `npm run build`, `npm run test:e2e` — passes before each commit, verified from cold.
Corrections are mutation-tested, and a deviation from this document is either fixed or
written into it, never carried silently.

| # | Row | Proves it |
| --- | --- | --- |
| 1 | **P0-1** desktop composition: breakpoint, larger board, the rail of §2.3 | E2E |
| 2 | **P0-2** geometry assertions for the art as it stands | unit + E2E |
| 3 | **P0-3** test-only sheet route over the real components; proven absent from the bundle | unit + E2E |
| 4 | **P0-4** four baselines; container pinned by digest; diff budget measured | E2E |
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
