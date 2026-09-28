/**
 * WCAG contrast from the palette's own values (graphics spec P0-5, row 5).
 *
 * The palette holds two notations: `#rrggbb`, and the `oklch()` it inherited from Tailwind's
 * palette. Both are reduced to gamma-encoded sRGB channels in 0-1, which is where browsers
 * composite a translucent colour over what is under it and where WCAG defines luminance.
 */

export type Rgb = readonly [number, number, number]

const hex = (value: string): Rgb | null => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
    return m && [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}

/**
 * CSS Color 4's OKLCh to sRGB (Ottosson's matrices). Out-of-gamut channels are clipped,
 * which is what a browser does on an sRGB display and near enough for a ratio.
 */
const oklch = (value: string): Rgb | null => {
    const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value)
    if (m === null) return null
    const L = Number(m[1]) / 100
    const C = Number(m[2])
    const h = Number(m[3]) * Math.PI / 180
    const a = C * Math.cos(h)
    const b = C * Math.sin(h)
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    const linear = [
        4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s,
    ]
    const encode = (c: number) => {
        const x = Math.min(1, Math.max(0, c))
        return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    }
    return [encode(linear[0]), encode(linear[1]), encode(linear[2])]
}

export const toRgb = (value: string): Rgb => {
    const rgb = hex(value) ?? oklch(value)
    if (rgb === null) throw new Error(`cannot read ${value} as a colour`)
    return rgb
}

/** `top` at `alpha` over an opaque `under`, as the browser composites it. */
export const over = (top: string, alpha: number, under: string): Rgb => {
    const [t, u] = [toRgb(top), toRgb(under)]
    return [0, 1, 2].map(i => alpha * t[i] + (1 - alpha) * u[i]) as unknown as Rgb
}

export const luminance = (colour: string | Rgb): number => {
    const [r, g, b] = typeof colour === 'string' ? toRgb(colour) : colour
    const channel = (c: number) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export const contrast = (a: string | Rgb, b: string | Rgb): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}
