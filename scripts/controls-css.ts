import { CONTROL, control, type Variant, type VariantName } from '../app/controls'
import { cssName, type Token } from '../app/palette'

/**
 * `app/controls.css`, rendered from `app/controls.ts` (graphics spec P2-2, row 14).
 *
 * The pattern `palette-css.ts` set: CSS cannot import TypeScript, so the stylesheet's half is
 * generated, committed, and required byte-identical to this by `tests/controls.test.ts`.
 *
 * One rule set per variant, in the `components` layer: above the base layer's rules for
 * every button (P1-6's focus and press, P2-1's text), and below Tailwind's utilities. The
 * archive's current day is the `day` variant's own (`aria-current`, below), the picker's
 * chosen piece the `chip` variant's (`aria-checked`), and a toggle's pressed state a raised
 * variant's (`aria-pressed`, since UI row 3; utilities in `controlStates.ts` until then).
 * Hover waits for a fine pointer that can hover, as every hover in the game must (P1-6).
 *
 * **The edge is a shadow** (UI row 3): a solid one, straight down, beneath the box, so it
 * takes no layout and a pressed control can sink into the space it held. Rings are shadows
 * too, so every rule that draws one draws the edge with it: two `box-shadow` declarations
 * would not add up, the later would replace the earlier.
 */
export const CONTROLS_CSS_PATH = 'app/controls.css'

const v = (token: Token) => `var(--${cssName(token)})`

const rules = (name: VariantName): string[] => {
    const c: Variant = CONTROL[name]
    const at = `.${control(name)}`
    const border = c.border?.width ?? 0
    /** The box shadow: the edge in `edgeColour`, if any, under an optional 2px ring. */
    const shadow = (edgeColour: Token | null, ring?: Token) => {
        const layers = [
            ring ? `0 0 0 2px ${v(ring)}` : null,
            c.edge && edgeColour ? `0 ${c.edge.depth}px 0 0 ${v(edgeColour)}` : null,
        ].filter(l => l !== null)
        return `box-shadow: ${layers.length ? layers.join(', ') : 'none'};`
    }
    const edge = c.edge?.colour ?? null
    const rest = [
        typeof c.surface === 'string' ? `background-color: ${v(c.surface)};` : null,
        c.border ? `border: ${c.border.width}px solid ${v(c.border.colour)};` : null,
        `border-radius: ${c.radius}px;`,
        `padding: ${c.padding.y - border}px ${c.padding.x - border}px;`,
        c.min.width ? `min-width: ${c.min.width}px;` : null,
        `min-height: ${c.min.height}px;`,
        c.ink ? `color: ${v(c.ink)};` : null,
        `font-weight: ${c.weight};`,
        c.edge ? shadow(edge) : null,
        // The press's 80ms (UI-SPEC §3.5), over the base layer's 120 for every button.
        c.press === 'sink' ? 'transition-duration: 80ms;' : null,
    ]
    const block = (selector: string, lines: (string | null)[], indent = '  ') => {
        const body = lines.filter((l): l is string => l !== null)
        return body.length === 0 ? [] : [`${indent}${selector} {`, ...body.map(l => `${indent}  ${l}`), `${indent}}`]
    }
    const marks = c.surface !== null && typeof c.surface === 'object'
        ? Object.entries(c.surface).flatMap(([mark, token]) =>
            block(`${at}[data-mark="${mark}"]`, [`background-color: ${v(token)};`]))
        : []
    // Held down: the edge's depth lower, and no edge, while the press lasts or the toggle is on.
    const sunk = c.edge ? [`translate: 0 ${c.edge.depth}px;`, 'filter: none;'] : []
    // Its conditions in `:where()`, which adds no specificity: a pointer pressing is hovering
    // too, and the press, at a class and two pseudo-classes, has to win over this.
    const hover = block(`${at}:hover:where(:enabled:not([aria-pressed="true"]))`, [
        c.hover.edge || c.hover.ring ? shadow(c.hover.edge ?? edge, c.hover.ring) : null,
        c.hover.scale ? `scale: ${c.hover.scale};` : null,
    ], '    ')
    const checkedHover = c.checked && c.hover.edge
        ? block(`${at}[aria-checked="true"]:enabled:hover`, [shadow(c.hover.edge, c.checked.ring)], '    ')
        : []
    return [
        ...block(at, rest),
        ...marks,
        ...(c.current ? block(`${at}[aria-current]`, [`box-shadow: 0 0 0 2px ${v(c.current.ring)};`]) : []),
        ...(c.checked ? block(`${at}[aria-checked="true"]`, [shadow(edge, c.checked.ring)]) : []),
        ...(c.pressed ? block(`${at}[aria-pressed="true"]`, [
            `background-color: ${v(c.pressed.surface)};`,
            `color: ${v(c.pressed.ink)};`,
            ...sunk,
            shadow(null),
        ]) : []),
        ...block(`${at}:focus-visible`, [`outline-color: ${v(c.focus)};`]),
        ...block(`${at}:disabled`, [
            c.disabled.surface ? `background-color: ${v(c.disabled.surface)};` : null,
            c.disabled.ink ? `color: ${v(c.disabled.ink)};` : null,
            c.disabled.opacity !== undefined ? `opacity: ${c.disabled.opacity};` : null,
            c.disabled.filter ? `filter: ${c.disabled.filter};` : null,
            c.edge ? shadow(null) : null,
        ]),
        // One media block per hover rule, so each one's query is the line above it.
        ...[hover, checkedHover].flatMap(h => h.length ? ['  @media (hover: hover) and (pointer: fine) {', ...h, '  }'] : []),
        // After the hover, which it ties on specificity: a pointer pressing is also hovering,
        // and the press is what it is doing. A chosen chip keeps its ring while pressed.
        ...(c.press === 'sink' ? [
            ...block(`${at}:not(:disabled):active`, [...sunk, shadow(null)]),
            ...(c.checked ? block(`${at}[aria-checked="true"]:not(:disabled):active`, [shadow(null, c.checked.ring)]) : []),
            // Reduced motion: a press doesn't move; its edge still goes. A toggle that is on
            // stays down -- that's its state, not a motion (row 3's contract, codex).
            '  @media (prefers-reduced-motion: reduce) {',
            ...block(`${at}:not(:disabled):not([aria-pressed="true"]):active`, ['translate: none;'], '    '),
            '  }',
        ] : []),
    ]
}

export const renderControlsCss = (): string => [
    '/*',
    ' * Generated by `npm run tokens` from `app/controls.ts`. Do not edit: change the variant',
    ' * there and regenerate. `tests/controls.test.ts` fails when the two disagree.',
    ' */',
    '@layer components {',
    ...(Object.keys(CONTROL) as VariantName[]).flatMap(rules),
    '}',
    '',
].join('\n')
