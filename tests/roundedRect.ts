/**
 * How far a silhouette is from being a rounded rectangle (graphics spec P1-2, row 8).
 *
 * P1-2 asks that the rock's silhouette "deviate from a rounded rectangle by ≥0.05 of the
 * cell at three or more points". Read against one fixed rounded rectangle -- the domino's,
 * say -- a smaller rounded rectangle would pass, and so would the domino's own shape moved a
 * twentieth of a cell. So it is read against the rounded rectangle that fits the silhouette
 * best, of any size, corner radius, position and rotation; and "three points" as three
 * points of the outline that are pairwise at least `separation` apart along it, so that one
 * nick counts once however many points it holds. A feature long enough to hold two such
 * points counts twice: it is then a deviation along more than `separation` of outline.
 *
 * **Points of the outline, not its vertices.** The outline is sampled at equal steps of
 * arc length (`around`); every sample is a point of the silhouette, so a deviation found at
 * one is a deviation of the silhouette. A rounded rectangle drawn as a polygon has every
 * sample on it, to within its chords' sag, and fails.
 *
 * **Two checks, of different strength** -- and the difference matters, so it is stated:
 *
 *   - `boxFamilyLowerBound` is **exhaustive** over one family: every axis-aligned rounded
 *     rectangle with the silhouette's own bounding box, at every corner radius. It samples
 *     the radius on a grid and subtracts the most any radius between two grid points could
 *     change the answer, so what it returns is a bound, not an estimate. The domino's
 *     silhouette on the same cell is a member of this family.
 *   - `closestRoundedRect` covers **all six parameters, by search**: a Nelder-Mead descent
 *     from many starting rectangles, refined, keeping the best. A search can miss the true
 *     best fit, so its answer is an upper bound on how close a rounded rectangle can come.
 *     A proof over all six was attempted -- a branch and bound on the same Lipschitz
 *     argument as the family check -- and did not finish in 50 million boxes. What stands
 *     behind the search instead is agreement: `tests/rock.test.tsx` holds it to a fit a far
 *     heavier, independent search found.
 */

export type Point = readonly [number, number]

/** A rounded rectangle: centre, half-sides, corner radius as a fraction of the shorter half, turn. */
export type RoundedRect = { cx: number, cy: number, a: number, b: number, k: number, turn: number }

/** From `p` to the edge of `q`: the magnitude of the rounded box's exact signed distance. */
export const toEdge = (p: Point, q: RoundedRect): number => {
    const [dx, dy] = [p[0] - q.cx, p[1] - q.cy]
    const [cos, sin] = [Math.cos(q.turn), Math.sin(q.turn)]
    const x = Math.abs(cos * dx + sin * dy)
    const y = Math.abs(-sin * dx + cos * dy)
    const r = q.k * Math.min(q.a, q.b)
    const [qx, qy] = [x - q.a + r, y - q.b + r]
    return Math.abs(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r)
}

export const perimeter = (polygon: readonly Point[]) => polygon.reduce((s, p, i) => {
    const q = polygon[(i + 1) % polygon.length]
    return s + Math.hypot(q[0] - p[0], q[1] - p[1])
}, 0)

/** The outline of a closed polygon, `count` points at equal steps of arc length. */
export const around = (polygon: readonly Point[], count: number): Point[] => {
    const edges = polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]] as const)
    const lengths = edges.map(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]))
    const total = perimeter(polygon)
    const out: Point[] = []
    let edge = 0
    let start = 0
    for (let i = 0; i < count; i++) {
        const at = (i * total) / count
        while (at > start + lengths[edge]) start += lengths[edge++]
        const [p, q] = edges[edge]
        const t = (at - start) / lengths[edge]
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
    }
    return out
}

export type Sampling = { separation: number, samples: number }

/**
 * How far a polygon's outline stands off a rounded rectangle at three separated places: the
 * largest `t` such that three outline points, each at least `t` from the rectangle's edge,
 * are pairwise at least `separation` apart along the outline.
 */
export const deviation = (polygon: readonly Point[], { separation, samples }: Sampling) => {
    const outline = around(polygon, samples)
    const n = samples
    const apart = Math.ceil((separation * n) / perimeter(polygon))
    const d = new Float64Array(n)
    const next = new Int32Array(2 * n + 1)
    /*
     * Whether three points at least `t` out exist, `apart` steps apart around the cycle.
     * For each first point, the nearest qualifying second and third are the best choice:
     * taking them as early as possible leaves the most room for the gap back to the first.
     */
    const three = (t: number) => {
        next[2 * n] = -1
        for (let i = 2 * n - 1; i >= 0; i--) next[i] = d[i % n] >= t ? i : next[i + 1]
        for (let i = 0; i < n; i++) {
            if (d[i] < t) continue
            const j = i + apart < 2 * n ? next[i + apart] : -1
            if (j < 0) continue
            const k = j + apart < 2 * n ? next[j + apart] : -1
            if (k >= 0 && k - i <= n - apart) return true
        }
        return false
    }
    return (q: RoundedRect) => {
        for (let i = 0; i < n; i++) d[i] = toEdge(outline[i], q)
        const sorted = Float64Array.from(d).sort()
        // The largest distance for which three exist; the answer is monotone in it.
        let [lo, hi] = [-1, n - 1]
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1
            if (three(sorted[mid])) lo = mid
            else hi = mid - 1
        }
        return lo < 0 ? 0 : sorted[lo]
    }
}

const bounds = (polygon: readonly Point[]) => {
    const xs = polygon.map(p => p[0])
    const ys = polygon.map(p => p[1])
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

/**
 * A certified lower bound on the deviation from every axis-aligned rounded rectangle with the
 * polygon's own bounding box, over every corner radius.
 *
 * The radius is sampled at `steps` + 1 points from 0 to half the shorter side. Between two
 * of them it moves by at most half a step, and the signed distance to a rounded box moves
 * by at most 1 + √2 times what its radius does (once directly, and √2 through the corner's
 * centre, which moves diagonally with it) -- as does the deviation, a best of minima of
 * those distances. So the least sampled deviation, less that, holds for every radius.
 */
export const boxFamilyLowerBound = (polygon: readonly Point[], sampling: Sampling, steps = 2000) => {
    const f = deviation(polygon, sampling)
    const { x0, x1, y0, y1 } = bounds(polygon)
    const [a, b] = [(x1 - x0) / 2, (y1 - y0) / 2]
    const step = Math.min(a, b) / steps
    let least = Infinity
    let at = 0
    for (let i = 0; i <= steps; i++) {
        const r = i * step
        const value = f({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, a, b, k: r / Math.min(a, b), turn: 0 })
        if (value < least) [least, at] = [value, r]
    }
    return { bound: least - (1 + Math.SQRT2) * (step / 2), radius: at }
}

/** Nelder-Mead, minimising `f` from `start` with initial steps `step`. */
const descend = (f: (v: number[]) => number, start: number[], step: number[], iterations: number) => {
    const n = start.length
    let simplex = [start, ...start.map((_, i) => start.map((x, j) => x + (i === j ? step[i] : 0)))]
    let values = simplex.map(f)
    for (let it = 0; it < iterations; it++) {
        const order = values.map((_, i) => i).sort((x, y) => values[x] - values[y])
        simplex = order.map(i => simplex[i])
        values = order.map(i => values[i])
        const centroid = start.map((_, j) => simplex.slice(0, n).reduce((s, v) => s + v[j], 0) / n)
        const toward = (t: number) => centroid.map((c, j) => c + t * (c - simplex[n][j]))
        const reflected = toward(1)
        const fr = f(reflected)
        if (fr < values[0]) {
            const expanded = toward(2)
            const fe = f(expanded)
            ;[simplex[n], values[n]] = fe < fr ? [expanded, fe] : [reflected, fr]
        } else if (fr < values[n - 1]) {
            ;[simplex[n], values[n]] = [reflected, fr]
        } else {
            const contracted = toward(-0.5)
            const fc = f(contracted)
            if (fc < values[n]) {
                ;[simplex[n], values[n]] = [contracted, fc]
            } else {
                for (let i = 1; i <= n; i++) {
                    simplex[i] = simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j]))
                    values[i] = f(simplex[i])
                }
            }
        }
    }
    const best = values.indexOf(Math.min(...values))
    return { at: simplex[best], value: values[best] }
}

const rectOf = (v: number[]): RoundedRect =>
    ({ cx: v[0], cy: v[1], a: Math.abs(v[2]), b: Math.abs(v[3]), k: Math.min(1, Math.abs(v[4])), turn: v[5] })

/**
 * The closest rounded rectangle found: the least deviation over a descent from every
 * combination of corner radius, rotation and scale below, each started on the polygon's
 * bounding box and refined with smaller steps.
 *
 * Measured on the rock, more iterations change little: 300, 600 and 1,200 per descent found
 * 0.0749, 0.0749 and 0.0747 of the cell. The starting points matter more than the descent.
 * `stopBelow` ends the search at the first fit under it, for a caller that only needs to
 * know one exists.
 */
export const closestRoundedRect = (
    polygon: readonly Point[],
    sampling: Sampling,
    { iterations = 400, stopBelow = -Infinity }: { iterations?: number, stopBelow?: number } = {},
) => {
    const f = deviation(polygon, sampling)
    const objective = (v: number[]) => f(rectOf(v))
    const { x0, x1, y0, y1 } = bounds(polygon)
    const size = Math.max(x1 - x0, y1 - y0)
    let best = { at: [] as number[], value: Infinity }
    for (const k of [0, 0.35, 0.7, 1])
        for (const turn of [-0.3, 0, 0.3])
            for (const scale of [0.85, 1, 1.15]) {
                const start = [(x0 + x1) / 2, (y0 + y1) / 2, scale * (x1 - x0) / 2, scale * (y1 - y0) / 2, k, turn]
                const coarse = descend(objective, start, [0.1 * size, 0.1 * size, 0.1 * size, 0.1 * size, 0.2, 0.15], iterations)
                const fine = descend(objective, coarse.at, [0.03 * size, 0.03 * size, 0.03 * size, 0.03 * size, 0.1, 0.05], iterations)
                if (fine.value < best.value) best = fine
                if (best.value < stopBelow) return { deviation: best.value, rect: rectOf(best.at) }
            }
    return { deviation: best.value, rect: rectOf(best.at) }
}
