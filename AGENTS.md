# Working on Domino Fill

Rules for any agent planning, building or reviewing changes in this repository. They are
how every change so far was made. Where a rule names a reason, the reason is a real incident
in this repository's history.

## Two agents, one set of rules

Two agents work here, Claude and codex, and **both plan and build**. Neither role belongs to
either agent: for each change, the user says which agent takes it, and **the other agent
reviews** it, plan and code alike. The user passes messages between the two. Below, "the
builder" is whichever agent is doing the change and "the reviewer" is the other one.

- Rules apply to the builder and the reviewer alike: a reviewer checks the work against
  them, and says plainly what it verified itself and what it only read.
- Don't start a change the user gave the other agent, and don't commit to its branch.
- A reviewer's recommendation is advice to the user, not a decision.

## The project

- A daily domino puzzle: Next.js 16, React 19, MobX, Tailwind v4. Unit tests are Vitest;
  browser tests are Playwright, Chromium only.
- `SPEC.md` is the original spec, with "Amended" notes where later work changed it.
  `GRAPHICS-SPEC.md` covers the visual design. `NEXT-STEPS.md` holds the decision log,
  the open ideas with their decisions, and every implementation contract, with "As built"
  notes under each.
- Code: `app/stores/` (game state: `PuzzleSession`, `BoardsStore`, saved progress),
  `app/dominoFill/` (components), `app/challenge/` (the Daily Challenge, Ruleset v1),
  `app/palette.ts` and `app/controls.ts` (design tokens; `npm run tokens` regenerates the
  CSS). Tests: `tests/` (unit), `e2e/` (browser), `visual-tests/` (pixel baselines).
- The user's machine is Windows; shell commands are Git Bash.

## The flow for every change

1. **Decision.** Product choices are the user's, and so is which agent builds the change.
   Ask; don't infer. Record each decision in NEXT-STEPS's decision log, dated, and in the
   idea's Decision column.
2. **Contract first.** The builder writes an implementation contract in NEXT-STEPS before
   any code: why, how it works today (read from the code, cited), the rules, what's not in
   it, and the tests. The reviewer reviews it; the builder makes every correction in the
   contract and says so there. No code until the contract is accepted.
3. **Build** on a feature branch from `master`, against the contract.
4. **Mutation-test** every change (below).
5. **"As built" notes** in the contract: choices made inside it, anything measured, test
   counts, the mutation tally, and any correction after review.
6. **Gate, then commit** (below). Push, and report to the reviewer.
7. **PR and merge only when the user says so.** Merge style is a merge commit, pinned to
   the reviewed head: `gh pr merge N --merge --match-head-commit <full sha>`. Then confirm
   CI passed on `master`.

## Commits

- One atomic change per commit. A docs decision and the code it leads to are separate.
- A change that alters pixels puts `[visual update]` in its commit message. CI then
  regenerates the baselines and uploads them; download them with
  `gh run download <run id> -n visual-baselines`, and commit only the baseline files that
  differ, in a separate commit.
- CI uses `cancel-in-progress`: don't push to a branch while a run you need is going.
- Each agent marks its own commits the way its tools do (Claude ends the message with a
  `Co-Authored-By: Claude …` trailer), so the history shows who built what.

## The gate: before every commit, from cold

Every step's exit code is checked separately, and the commit is a separate step that runs
only if all of them were 0. Never decide on a `grep` of the output: a commit once went in
with a failing test because grep matched "1 failed".

```bash
# Wait for the socket pool first: under ~100 sockets in TIME_WAIT (see below).
rm -rf .next tsconfig.tsbuildinfo node_modules/.vite node_modules/.vitest
npx tsc --noEmit;                    echo "tsc=$?"
npm run lint;                        echo "lint=$?"
npm test 2> /tmp/unit-stderr.txt;    echo "test=$?  stderr bytes: $(wc -c < /tmp/unit-stderr.txt)"
npm run build;                       echo "build=$?"
npm run test:e2e;                    echo "e2e=$?"
```

- **Unit stderr must be 0 bytes.** A noisy suite has hidden real failures here before.
- **Socket exhaustion on this machine.** A full browser run leaves thousands of sockets in
  TIME_WAIT, and the next run then fails with `net::ERR_NO_BUFFER_SPACE`. Before the gate,
  wait until `netstat -an | grep -c TIME_WAIT` is under 100. A failure with that error is
  the machine, not the app, but it is still a failed gate: rerun the whole gate, and report
  both runs.
- **A failed gate means no commit,** even when the change is docs only and the failure
  looks unrelated. Rerun from cold; if a test is flaky, report it, and fix it in its own
  change.

## Tests

- **Mutation-test every correction and feature.** Break the code on purpose, one way at a
  time (a scratch script that edits, runs the relevant tests, and restores), and confirm a
  test fails *at the assertion meant to catch it*. A probe caught by the wrong assertion is
  a weak test: fix the test. Report the tally ("14 of 14 caught") and list the probes.
- **Tests never change committed assets,** and a contract is never weakened to make a test
  pass. Change the mechanism instead.
- **Pin the day in browser tests that depend on the date:** `pinDay(page, day)` from
  `e2e/calendar.ts`, before the board loads. Rocks change daily, and on the 1st of a month
  the archive has no earlier day (`LATE_IN_A_MONTH`). Never a fixed UTC instant. A
  date-dependent `test.skip` is a bug: make it an assertion on a pinned day.
- **Don't compare timestamps across browser pages.** Two pages' clocks disagreed by 0.1 ms
  and failed a test; prove order by what one page reads of the other's writes.
- Tests changed on purpose are listed in the contract, each with why.

## Reporting

- **Word each claim by its evidence:** measured, read in the code, read in a spec but not
  tested, inferred. Say which.
- **Exact counts,** and every failed run alongside the passing ones. Never "all green" if
  any run failed.
- **Deviations go into the spec,** as an "Amended" note in SPEC.md or GRAPHICS-SPEC.md, or
  in NEXT-STEPS, never only in a message.
- Notes to the other agent start with "Written for: …", naming the reader.

## Constraints

- **No Docker, anywhere:** not on the user's PC, and no containers, images, `container:`
  or `services:` in GitHub Actions. Plain Ubuntu runners only. Don't add one without asking
  the user.
- **No keyboard shortcuts** beyond the existing board keys (decided 2026-09-28).
- **No servers.** Everything competitive runs on the device, on the honour system
  (Principle 5 in NEXT-STEPS).

## Where things stand (2026-10-10)

- The Daily Challenge: decisions and Ruleset v1 (D2) are in NEXT-STEPS. Slice 1 (the
  attempt record, its store and the clock, `app/challenge/`) is built and reviewed, not yet
  wired into the game. Next: slice 2, the wiring, then slice 3, what's on screen. Each needs
  its own contract first, by whichever agent the user gives it to.
- Known flake to diagnose: `e2e/theme.spec.ts:71` read a background as `[0,0,0]`; its
  parser also maps transparent to that, so capture the raw CSS value first.
