/**
 * Every size text is set at, as a role (graphics spec P2-1, row 13).
 *
 * Before this row there were eleven: Tailwind's `text-xs` to `text-3xl` scattered across the
 * components, several declaring a size on a container whose only children were buttons with
 * a size of their own, one (`text-2xl` on the scoring key) sizing no text at all. Now a text
 * surface is one of five roles, and a role is a size and a line height together.
 *
 * **UI row 2** made them `UI-SPEC.md` §3.2's, in Nunito, and gave each its weight: six roles,
 * each a size, a line height and a weight, which Tailwind's `text-<role>` sets together. The
 * spec's seventh, `title`, arrives with its only consumer, the top bar (row 6). The weights are
 * the four §3.2 loads, and nothing in `app/` asks for another (`tests/typography.test.ts`).
 *
 * **Plain TypeScript with no imports**, as the palette is, and for the same reason: CSS reads
 * it through `app/typography.css`, generated from here by `npm run tokens`, and the tests read
 * it directly. The generated file also clears Tailwind's own scale, so `text-sm` and the rest
 * produce no CSS at all. A size written any other way is for `tests/typography.test.ts` to
 * find in the source, in the forms it lists, and for `e2e/typography.spec.ts` to find in what
 * the browser computes, on the surfaces it visits.
 *
 * `size` is CSS px, except the board label's: that is `LABEL_FONT_FRACTION` of the cell,
 * which the board computes and hands to CSS as `--label-font` (graphics row 2), so it is
 * named here by the property that carries it. Line heights are unitless, multiples of size.
 */
export const TYPE = {
    /** The line targets round the board. */
    boardLabel: { size: 'var(--label-font)', lineHeight: 1, weight: 900 },
    /**
     * A card's or sheet's heading: the completion card's outcome, the results' heading, the
     * tutorial's title. `cardTitle` until UI row 2, at 24 / 1.25 in the bold of the day.
     */
    display: { size: 28, lineHeight: 1.15, weight: 900 },
    /** The challenge clock (UI row 2; it was body text). */
    clock: { size: 20, lineHeight: 1, weight: 900 },
    /**
     * Every button and toggle. Its weight is the one at rest: `app/controls.ts` draws the
     * primary and a pressed toggle at 900 until row 3 (UI-SPEC §3.2, amended).
     */
    control: { size: 16, lineHeight: 1.25, weight: 800 },
    /** Running text: the advice strip, the tutorial, the day banner, the archive's words. */
    body: { size: 15, lineHeight: 1.45, weight: 600 },
    /** The archive's dates, secondary notes. */
    meta: { size: 13, lineHeight: 1.4, weight: 700 },
} as const satisfies Record<string, { size: number | string, lineHeight: number, weight: Weight }>

export type Role = keyof typeof TYPE

/**
 * The weights the page loads (UI-SPEC §3.2). Emphasis inside a role is one of these too: 700
 * for what was `font-medium`, 800 for what was `font-semibold` (§3.2, amended).
 */
export type Weight = 600 | 700 | 800 | 900

export const WEIGHTS: readonly Weight[] = [600, 700, 800, 900]

/** A role's Tailwind utility: `cardTitle` is `text-card-title`. */
export const roleName = (role: Role): string => role.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
