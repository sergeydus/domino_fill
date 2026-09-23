"use client"
import { Component, type ReactNode } from 'react'

/**
 * The attributes that identify a control well enough to find it again (row 1, follow-up).
 *
 * Every control that changes place between the compositions already carries one of these,
 * so nothing is added to the markup for the sake of the tests or of this mechanism.
 */
const CONTROL_ATTRIBUTES = [
  'data-check', 'data-hint', 'data-undo', 'data-reset',
  'data-difficulty', 'data-level', 'data-open-archive', 'data-mute',
] as const

/** A selector that will find this control again after it has been rebuilt, or null. */
export const controlKey = (node: Element | null): string | null => {
  if (!(node instanceof HTMLElement)) return null
  for (const attribute of CONTROL_ATTRIBUTES) {
    const value = node.getAttribute(attribute)
    if (value === null) continue
    // Boolean markers (`data-reset`) render as an empty value; valued ones
    // (`data-difficulty="hard"`) have to keep theirs, or the key finds a sibling.
    return value === '' ? `[${attribute}]` : `[${attribute}="${value}"]`
  }
  return null
}

type Props = {
  /** Names the arrangement. A different name means the children are about to be rebuilt. */
  composition: string
  children: ReactNode
}

/**
 * Keep the keyboard's place when the page is rearranged (graphics spec P0-1, row 1).
 *
 * Crossing the layout breakpoint moves a control from the column to the rail or back, and
 * React reparents by unmounting and rebuilding: the focused element is *destroyed* and
 * focus falls to `<body>`. Measured in both directions before this existed -- focus Reset
 * at 1280x800, narrow the window, and focus is on the body; the same again widening. A
 * keyboard player resizing a window, or a tablet being rotated, lost their place entirely.
 *
 * **Why a class, in a codebase with no other class components.** The answer has to be read
 * out of the DOM in the last instant before React mutates it and written back in the first
 * instant after, and `getSnapshotBeforeUpdate` is the only API that offers that pair. Two
 * shapes were built and rejected first, both for reasons that only showed up when measured:
 *
 *   - A `focusin` listener remembering the last control, restored afterwards. React's
 *     unmount fires `focusout` on the control it is removing, so the listener clears the
 *     target a moment before the restore needs it. Instrumented, with the key reliably
 *     `null` at exactly the point it was wanted.
 *   - Reading `document.activeElement` during the function component's render. It works,
 *     but render must be pure and may be restarted or abandoned; an external DOM read is
 *     not guaranteed to give the same answer twice, and the passive effect that followed
 *     it was late enough to leave a gap in which focus could be placed deliberately and
 *     then overwritten.
 *
 * The before-mutation phase has neither problem: it runs once per commit, after React has
 * decided what to do and before it has done any of it, and the restore in
 * `componentDidUpdate` lands in the same commit -- synchronously, before paint, with no
 * window for anything else to place focus in between.
 *
 * The single-DOM alternative -- one tree arranged by CSS -- is tidier and was also built
 * and measured. It costs more than it saves: with one tree the rail's children straddle
 * the board in the phone's visual order, so `order` has to lift the difficulty selector
 * above the board while it sits after it in the DOM. That is a focus-order mismatch
 * (WCAG 2.4.3) on every phone, to fix an occasional one on desktop. This keeps DOM order
 * and visual order identical in both compositions.
 */
export class FocusAcrossComposition extends Component<Props> {
  /**
   * The control about to lose its node, as a selector -- or null, which is most updates.
   *
   * Null covers two different things, and both of them mean "not our business": the
   * arrangement did not change (this runs on *every* update, since the board re-renders on
   * every move), or the focus is somewhere that is not a control that moves. A board cell,
   * or the page background after someone clicked it, is left exactly where it is.
   */
  getSnapshotBeforeUpdate(previous: Props): string | null {
    if (previous.composition === this.props.composition) return null
    return controlKey(document.activeElement)
  }

  componentDidUpdate(_previous: Props, _state: unknown, snapshot: string | null) {
    if (snapshot === null) return
    /*
     * Only when the rebuild really did drop it.
     *
     * React runs this phase from the leaves upwards, so a child's layout effect has
     * already had its turn: anything that places focus deliberately as part of this same
     * commit -- a dialog taking it, a control claiming it -- has done so by now, and
     * putting the old control back would be overruling it. An earlier version of this
     * mechanism restored unconditionally, which was safe only because nothing in the page
     * competed for focus on that commit yet.
     */
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    document.querySelector<HTMLElement>(snapshot)?.focus()
  }

  render() {
    return this.props.children
  }
}
