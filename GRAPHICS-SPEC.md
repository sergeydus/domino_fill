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
job.

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

- **Half-pixel origins.** The board shell lands at `x = 458.5` (6×6) and `x = 489.98` (8×8)
  at 1280×800. At dpr 1 every cell edge and every stroke then straddles a device pixel.
- **28.4% of the width.** The shell is 363px in a 1280px viewport. The desktop view is
  mostly empty ground.
- **Zero CSS transitions on the page.** All motion is `motion/react`: piece entry, the
  rejection shake, a difficulty hover. Hover and press states are instantaneous.
- **No visual test of any kind.** No `toHaveScreenshot`, no geometry assertions on the art.
  413 browser tests, and not one of them would notice if every piece turned black.
- **Type has two sources.** `body` sets `Arial, Helvetica, sans-serif` while `page.tsx`
  sets `font-sans` → Geist, so the app renders Geist and the body rule is a vestige that
  applies to whatever escapes that div.

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
- **A warm, saturated-but-not-neon palette**, including a warmer checkerboard. The board
  should feel like a surface you would put pieces down on.
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
forced through a single accent. One accent for interactive chrome; separate, named
semantic colours for success, problem and hint. This supersedes the earlier draft's "one
accent, everywhere" rule, which would have flattened meaning into decoration.

### 2.3 Desktop

Use the available space confidently. At a suitable breakpoint, **enlarge the board and
arrange secondary controls in a compact side rail or adjacent panel**; below that
breakpoint, keep the simple single-column composition.

This is a composition decision, so it lands **before** any visual baseline is captured —
otherwise every baseline is taken against a layout that is about to change. It is the first
row of this spec.

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

---

## 5. P0 — the foundation

Composition first, then the ability to see a regression, then the two refactors that make
the art tunable. No art row starts until all of P0 is in.

### P0-1 · The desktop composition (§2.3)

**Problem.** §1.5: the shell is 363px in a 1280px viewport — 28.4% of the width — and the
chrome is stacked in one column under it, which is the phone's answer given to a desktop.

**Shape.** A breakpoint; above it, a larger board and a compact side rail or adjacent panel
for secondary controls; below it, today's single column, unchanged.

**Acceptance.**

- At ≥1024px wide, the 8×8 board's cell is **≥56px** (today: 41), and the composition —
  board plus rail — occupies **≥60%** of the viewport width.
- Below the breakpoint the composition is single-column and the chrome row count is
  unchanged, so `e2e/sound.spec.ts`'s budget assertion still holds.
- Every existing layout guarantee passes untouched: 8×8 at 360×640, 800×400 landscape,
  50%–200% zoom, no horizontal overflow, the safe-area cases.
- No change to `MIN_CELL_PX`, `GUTTER_FRACTION`, `LABEL_FONT_FRACTION` or the shell
  arithmetic. If the board cap needs raising, that is a named constant changed in this row
  with its own test, not an edit to the budget.

### P0-2 · Geometry assertions for the art as it stands

**Problem.** Nothing can currently fail when the drawing changes.

**Shape.** Geometry assertions are the spine of this spec: box positions, SVG attribute
ratios and computed colours are readable in a diff, reviewable by a person, and stable
across platforms in a way pixels are not. This row pins **today's** art, so every later row
has something to move deliberately.

**Acceptance.** Each of the six constants in §1.1 is asserted at two cell sizes, so the
table above is reproduced by the suite rather than by this document.

### P0-3 · A component sheet that does not depend on the day

**Problem.** The day's puzzle comes from the player's local date. Any baseline taken from a
live board rots overnight, and no arrangement of pinned clocks makes a *component* sheet
worth maintaining that way.

**Shape.** A sheet rendered from **fixtures**, not from the day's board: both domino
orientations, a rock, an empty cell of each checker tone, the three target states, and the
hover / focus / candidate / hint states, plus representative controls. It is composed in the
test — server-rendered markup handed to the page, styled by the application's own
stylesheet from the running e2e server — so **no production route exists** for it and
nothing ships to players.

**Acceptance.** The sheet renders with the clock un-pinned and passes identically on two
different dates. Every state in §5/P0-4's list appears on it exactly once, asserted by count
rather than by eye.

### P0-4 · Four deterministic baselines

**Shape.** Exactly four, and no more without an argument:

| # | Baseline | Depends on the day? |
| --- | --- | --- |
| 1 | component/state sheet at **38px** | no |
| 2 | component/state sheet at **53px** | no |
| 3 | complete **360px phone** composition | yes — clock pinned |
| 4 | complete **desktop** composition | yes — clock pinned |

The full-page pair pins the date with `page.clock.install`, as `e2e/archive.spec.ts`
already does. The sheets must not.

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
  times and record the observed maximum — not chosen to make the suite pass.

**Acceptance.** Two consecutive runs of the unchanged suite produce zero diff. Deleting any
one row's art change fails a *named* geometry assertion as well as a pixel diff.

### P0-5 · The palette, in one place and in every consumer

**Problem.** §1.2: twenty literals, nine files, three blues, one already-drifted pip.

**Shape.** One TypeScript module of role-named tokens (`tileFace`, not `cream`), consumed by
three different kinds of consumer, which is the part that needs designing rather than
declaring:

1. **SVG components** import it directly.
2. **`scripts/icon.ts`** imports it directly — it runs in Node at build time, which is why
   the palette must be plain TypeScript with no React or CSS dependency.
3. **CSS and Tailwind** cannot import TypeScript, so `globals.css`'s custom properties are
   **generated** from the tokens by `npm run tokens`, and the generated file is committed —
   the same pattern rows 20b/20h used for the icons, and it fails the same way: a test
   asserts the committed CSS is byte-identical to what the generator produces.

Semantic colours are named for meaning (`success`, `problem`, `hint`) and are separate from
the interactive accent, per §2.2. `lineLabel.ts` keeps its semantics and sources its values
from here.

**Acceptance.** No colour literal survives outside the palette module and the generated CSS
— enforced by a test that greps the tracked source. `tests/lineFeedback.test.ts` already
computes contrast from a luminance function and asserts the *old* palette would fail it;
that check widens to every pair in §4, computed **from the tokens**, so the guarantee
survives a palette change instead of being re-typed beside it.

### P0-6 · One geometry module, in cell units

**Problem.** §1.1: pixel constants inside scalable art.

**Shape.** The pieces draw in a **normalised coordinate system** — a `viewBox` in cell units
— scaled once at the outer element by `squareSize`. The drawing is then expressed in the
units the design actually thinks in, and the only pixel values in a piece are the outer
`width`/`height`.

This row changes no proportions. Its success condition is that baselines 1–4 **do not move**
at 53px, where today's constants were evidently chosen.

**Acceptance.**

- The geometry-literal rule, stated narrowly so it is enforceable: *no literal denominated
  in CSS pixels may appear in the drawing.* Literals inside the normalised `viewBox` are the
  design and are expected; the rule is about units, not about numbers.
- A unit test renders each piece at 38, 53 and 75 and asserts every geometric attribute
  scales linearly within rounding.

### P0-7 · Device-pixel alignment

**Problem.** §1.5: `x = 458.5`, `x = 489.98`. At dpr 1 every edge straddles a device pixel.

**Shape.** Fix the centring that produces the fraction, not the drawing. SVG strokes are
centred on their path, so a stroke of odd device-pixel width lands half-on — the drawing
offsets by half a stroke where it matters.

**Acceptance.** At every viewport in the layout matrix, at `deviceScaleFactor` **1 and 2**,
the shell's `x`, `y`, `width`, `height` and every cell rect are integers in device pixels.
Fractional ratios (1.25, 1.5 — common on Windows) are **out of scope and said so**: they
cannot be made integral for all elements at once, and pretending otherwise would be the kind
of claim this repository keeps catching.

---

## 6. P1 — the art

### P1-1 · Proportions that hold at 38px

Retune the fractions from P0-6 against the **38px** rendering, per §2.1. Values are the
row's to choose; these bounds are not:

- Every fraction is constant across cell sizes (±1px rounding) — P0-6's test still passes.
- **Divider span ≥ 0.55 of the tile's width** at every cell size (today: 0.158 at 38px).
- **Pip diameter 0.18–0.30 of the cell**, with a clear margin of **≥0.06** to both the
  divider and the tile edge, at every cell size.
- **Outline weight ≤ 0.12 of the cell**, constant.
- **Extrusion depth 0.10–0.18 of the cell**, constant — "slightly exaggerated", not half a
  cell (today: 0.421 at 38px).
- Tile face against **both** checker tones ≥ **3:1** (WCAG 1.4.11, non-text), computed from
  the tokens.
- The cell's hit area is untouched: art may not change what `pointerUp` resolves.

### P1-2 · An irregular, faceted rock (§1.4, §2.1)

**Acceptance.**

- The rock's silhouette **deviates from a rounded rectangle by ≥0.05 of the cell at three or
  more points**, asserted from the path rather than judged by eye.
- Legible at 38px; ≥3:1 against both checker tones and against the tile face.
- `cellDescription`'s wording from row 19 is unchanged — the picture changes, the name does
  not.
- Covered by baselines 1 and 2, which is exactly the kind of silhouette question geometry
  alone cannot settle.

### P1-3 · A warmer board that is the loudest thing on its page

The checkerboard tones, the frame — whose 16px radius does not match the cells' 12px corner
— and the target labels, which float beside their lines with no visual tie.

**Acceptance.**

- Frame inner radius and cell corner radius agree **by construction**, from one token.
- The two checker tones differ by a stated ratio, and both clear ≥3:1 against the tile face
  and the rock.
- The target-to-line tie is a measurable geometric or tonal relationship, asserted as such.
- Every ratio in §4 re-proven from the tokens.

### P1-4 · Quieter controls, louder meaning (§2.2)

**Acceptance.**

- The accent token appears on interactive chrome only; `success`, `problem` and `hint` are
  their own tokens and appear only on the states they name — asserted by computed style,
  per control.
- The difficulty selector and the level arrows no longer carry the page's strongest colour:
  the board region's maximum chroma exceeds every chrome control's, measured.
- Three blues become one accent. `LevelSelector`'s labels, roles and destination wording are
  untouched.

### P1-5 · States legible at the floor

Anchor, candidate, hint and rejection are what the player reads while thinking. The hint is
a 3px `#15661a` outline inset 2px today — a tenth of a 38px cell, competing with a 6px piece
outline.

**Acceptance.**

- Each state is distinguishable from every other at 38px, **and from every other without
  colour** — P1-8's requirement, not a new one, so each carries a second channel.
- Each state's indicator is a fraction of the cell, not a pixel constant.
- ≥3:1 against both checker tones. All four states appear on baselines 1 and 2.

### P1-6 · Bounce, squash, and a surface that answers (§2.1)

The entry offset is 26px — 68% of a phone cell. And with zero CSS transitions, nothing
acknowledges a press before its result arrives.

**Acceptance.**

- Motion offsets and squash amplitudes are fractions of the cell; **amplitude ≤0.12**,
  **duration ≤200ms** for placement feedback.
- Press and hover states exist for every control.
- **Reduced motion covers CSS too.** `MotionConfig reducedMotion="user"` governs
  `motion/react` only; any new CSS transition or animation needs its own
  `@media (prefers-reduced-motion: reduce)` rule. Asserted under
  `emulateMedia({ reducedMotion: 'reduce' })`: computed `transition-duration` and
  `animation-duration` are `0s` on every element that has one — and non-zero without it, or
  the assertion proves nothing.

---

## 7. P2 — polish

- **P2-1 · One type source.** Drop the vestigial `Arial` body rule; state the type scale
  once, as `LABEL_FONT_FRACTION` already does for the board labels. *Acceptance:* one
  declaration of the family; every text surface resolves to it, asserted by computed style.
- **P2-2 · One control vocabulary.** `Check`/`Hint`/`Undo`/`Reset` are flat grey; `Archive`
  and `Sound on` are bordered white. *Acceptance:* every control of the same class shares
  surface, radius, padding and press treatment, from tokens; disabled states keep their
  current contrast.
- **P2-3 · The completion card**, the game's one celebration — semantic success colour per
  §2.2, bounded by P1-6's motion limits. *Acceptance:* covered by baseline 4; the card's
  copy, roles and focus behaviour are unchanged.
- **P2-4 · Icons regenerated from the palette.** `scripts/icon.ts` shares the ground and
  tile tokens. *Acceptance:* `npm run icons` regenerates; rows 20b/20h's tests — byte
  identity, PNG header, same drawing at every size, maskable mark inside r = 0.4 — pass
  **unaltered**.

---

## 8. Sequencing

One row, one commit. The full gate — `tsc --noEmit`, `npm run lint`, `npm test` with empty
stderr, `npm run build`, `npm run test:e2e` — passes before each commit, verified from cold.
Corrections are mutation-tested, and a deviation from this document is either fixed or
written into it, never carried silently.

| # | Row | Proves it |
| --- | --- | --- |
| 1 | **P0-1** desktop composition: breakpoint, larger board, side rail | E2E |
| 2 | **P0-2** geometry assertions for the art as it stands | unit + E2E |
| 3 | **P0-3** fixture component sheet, independent of the day's puzzle | E2E |
| 4 | **P0-4** four baselines; container pinned by digest; diff budget measured | E2E |
| 5 | **P0-5** palette module; generated CSS tokens; contrast computed from tokens | unit |
| 6 | **P0-6** normalised `viewBox` geometry; baselines must not move | unit + E2E |
| 7 | **P0-7** device-pixel alignment at dpr 1 and 2 | E2E |
| 8 | **P1-1** proportions retuned against the 38px rendering | unit + E2E |
| 9 | **P1-2** the irregular, faceted rock | unit + E2E |
| 10 | **P1-3** warmer board, matched radii, target association | E2E |
| 11 | **P1-4** quieter controls; semantic colours for meaning | E2E |
| 12 | **P1-5** states legible at 38px, and without colour | unit + E2E |
| 13 | **P1-6** bounce and squash; press states; CSS reduced-motion | unit + E2E |
| 14 | **P2-1** one type source | E2E |
| 15 | **P2-2** one control vocabulary | E2E |
| 16 | **P2-3** the completion card | E2E |
| 17 | **P2-4** icons regenerated; rows 20b/20h tests unaltered | unit + E2E |

Rows 1–7 are the gate. Row 1 comes first because baselines taken against a composition that
is about to change are baselines taken twice.

---

## 9. Open questions

Recorded rather than answered, because each is a decision rather than a defect. The art
direction is **not** among them — §2 settles it.

1. **Where is the desktop breakpoint, and does the rail hold Archive and Sound, or more?**
   Row 1 proposes and measures; it is the one row whose shape is not pinned by this document.
2. **Is four baselines the right number?** The argument for fewer: they are binaries, and
   §5/P0-4 is honest that nobody reviews them. The argument for more: silhouette and palette
   are what geometry cannot assert. Four is the starting point, and the number should be
   argued down rather than up.
3. **Does the warmer palette want a warmer ground?** `--background: #e8e7e7` is the one
   colour every contrast ratio in §4 is measured against, so moving it re-opens all of them
   in a single row. Possible, but it must be deliberate and it must be row 10's decision,
   not a side effect of row 5.
