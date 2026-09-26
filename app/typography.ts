/**
 * Every size text is set at, as a role (graphics spec P2-1, row 13).
 *
 * Before this row there were eleven: Tailwind's `text-xs` to `text-3xl` scattered across the
 * components, several declaring a size on a container whose only children were buttons with
 * a size of their own, one (`text-2xl` on the scoring key) sizing no text at all. Now a text
 * surface is one of five roles, and a role is a size and a line height together.
 *
 * **Plain TypeScript with no imports**, as the palette is, and for the same reason: CSS reads
 * it through `app/typography.css`, generated from here by `npm run tokens`, and the tests read
 * it directly. The generated file also clears Tailwind's own scale, so `text-sm` and the rest
 * produce no CSS at all: a size outside this table cannot be declared by accident, and
 * `tests/typography.test.ts` fails on one declared on purpose.
 *
 * `size` is CSS px, except the board label's: that is `LABEL_FONT_FRACTION` of the cell,
 * which the board computes and hands to CSS as `--label-font` (graphics row 2), so it is
 * named here by the property that carries it. Line heights are unitless, multiples of size.
 */
export const TYPE = {
    /** The line targets round the board. */
    boardLabel: { size: 'var(--label-font)', lineHeight: 1 },
    /** A card's heading: the completion card's outcome, the tutorial's title. */
    cardTitle: { size: 24, lineHeight: 1.25 },
    /** Every button and toggle. */
    control: { size: 16, lineHeight: 1.25 },
    /** Running text: the advice strip, the tutorial, the day banner, the archive's words. */
    body: { size: 14, lineHeight: 1.5 },
    /** The archive's dates, secondary notes. */
    meta: { size: 12, lineHeight: 1.5 },
} as const

export type Role = keyof typeof TYPE

/** A role's Tailwind utility: `cardTitle` is `text-card-title`. */
export const roleName = (role: Role): string => role.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
