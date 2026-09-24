import ts from 'typescript'

/**
 * The colour-literal scanner behind `tests/palette.test.ts` (graphics spec P0-5, row 5).
 *
 * Its own module so the audit can be pointed at source that is not on disk -- the tree as
 * it stood before row 5, read from git -- when measuring what it catches.
 */

/** CSS named colours (CSS Color 4). `transparent` and `currentColor` carry no colour. */
const NAMED = ('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond '
    + 'blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue '
    + 'cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey '
    + 'darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon '
    + 'darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet '
    + 'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen '
    + 'fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew '
    + 'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon '
    + 'lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey '
    + 'lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey '
    + 'lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine '
    + 'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue '
    + 'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose '
    + 'moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid '
    + 'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink '
    + 'plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon '
    + 'sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow '
    + 'springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke '
    + 'yellow yellowgreen').split(' ')

/** Tailwind's own palette families; a utility naming one bypasses the tokens. */
const FAMILIES = 'slate gray zinc neutral stone mauve olive mist taupe red orange amber yellow '
    + 'lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose'

/** Every Tailwind utility that takes a colour. */
export const COLOUR_UTILITY = '(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|'
    + 'from|via|to|decoration|divide|shadow|inset-shadow|inset-ring|drop-shadow|accent|caret|placeholder)'

const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
    ['hex', /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/gi],
    ['colour function', /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/gi],
    ['named colour', new RegExp(`(?<![\\w-])(?:${NAMED.join('|')})(?![\\w-])`, 'gi')],
    ['Tailwind palette utility', new RegExp(
        `(?<![\\w-])(?:[\\w-]+:)*${COLOUR_UTILITY}`
        + `-(?:(?:${FAMILIES.split(' ').join('|')})-\\d{2,3}|black|white)(?:/\\d+)?(?![\\w-])`, 'g')],
]

export type Finding = { file: string, line: number, kind: string, text: string }

/** Every colour literal in a piece of text. */
export const scanText = (text: string): { kind: string, text: string, at: number }[] =>
    PATTERNS.flatMap(([kind, re]) => [...text.matchAll(re)].map(m => ({ kind, text: m[0], at: m.index })))

/**
 * A TypeScript file, read as a syntax tree rather than as text.
 *
 * Comments are not colour -- this codebase's comments quote the old literals on purpose, as
 * the record of what was measured -- and a text scan cannot tell a comment from a string.
 * The tree can. Every string the code holds is scanned: string literals, template pieces
 * and JSX attribute values. JSX *text* is copy a player reads, not styling, and is skipped.
 *
 * Numbers can be colours too: the icon held its palette as byte triples, `[0xe8, 0xe7,
 * 0xe7]`, which no string pattern sees. So an array literal of three or four integers in
 * 0-255 is reported as well. The PNG signature (eight bytes) and a coordinate pair do not
 * qualify.
 */
export const scanTs = (file: string, source: string): Finding[] => {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const found: Finding[] = []
    const report = (node: ts.Node, kind: string, text: string) => found.push({
        file, kind, text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    })
    const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
            || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
            for (const hit of scanText(node.text)) report(node, hit.kind, hit.text)
        }
        if (ts.isArrayLiteralExpression(node) && (node.elements.length === 3 || node.elements.length === 4)
            && node.elements.every(e => ts.isNumericLiteral(e) && Number(e.text) <= 255
                && Number.isInteger(Number(e.text)))) {
            report(node, 'byte triple', node.getText(sf))
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
    return found
}

/** A stylesheet, with its comments removed and everything else scanned. */
export const scanCss = (file: string, source: string): Finding[] => {
    const stripped = stripCssComments(source)
    return scanText(stripped).map(hit => ({
        file, kind: hit.kind, text: hit.text,
        line: stripped.slice(0, hit.at).split('\n').length,
    }))
}

const blank = (text: string) => text.replace(/[^\n]/g, ' ')

const stripCssComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, blank)

/**
 * A source file with every comment blanked out, line breaks kept.
 *
 * TypeScript from its syntax tree: every comment is trivia of some token -- leading if it
 * starts a line, trailing if it shares one with the token before it -- so collecting both
 * for every token finds them all: `//`, `/* *\/`, and JSX's `{/* *\/}`. A range that falls
 * inside JSX text is dropped, because a `//` in copy a player reads is not a comment.
 */
export const stripComments = (file: string, source: string): string => {
    if (file.endsWith('.css')) return stripCssComments(source)
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const ranges = new Map<number, number>()
    const copy: [number, number][] = []
    const visit = (node: ts.Node) => {
        if (node.kind === ts.SyntaxKind.JsxText) {
            copy.push([node.pos, node.end])
            return
        }
        for (const r of ts.getLeadingCommentRanges(source, node.pos) ?? []) ranges.set(r.pos, r.end)
        for (const r of ts.getTrailingCommentRanges(source, node.end) ?? []) ranges.set(r.pos, r.end)
        for (const child of node.getChildren(sf)) visit(child)
    }
    visit(sf)
    let out = source
    for (const [pos, end] of ranges) {
        if (copy.some(([from, to]) => pos >= from && pos < to)) continue
        out = out.slice(0, pos) + blank(out.slice(pos, end)) + out.slice(end)
    }
    return out
}

/**
 * Whether comment-free `code` reads `token`, in any of the ways a consumer can:
 * `PALETTE.token` or `rgbBytes('token')` in TypeScript, a Tailwind utility on the generated
 * colour, `bg-(--token)`, or `var(--token)`. Whole names only: `PALETTE.accent` is not a
 * read of `accentEdge`, and a `data-hint` attribute is not a read of `hint`.
 */
export const isRead = (token: string, code: string): boolean => {
    const name = token.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
    return new RegExp(`PALETTE\\.${token}(?!\\w)`).test(code)
        || code.includes(`rgbBytes('${token}')`)
        || code.includes(`var(--${name})`)
        || code.includes(`(--${name})`)
        || new RegExp(`(?<![\\w-])(?:[\\w-]+:)*${COLOUR_UTILITY}-${name}(?:/\\d+)?(?![\\w-])`).test(code)
}
