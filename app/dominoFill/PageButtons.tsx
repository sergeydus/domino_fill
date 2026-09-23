"use client"
import { observer } from 'mobx-react'
import { LevelStore } from '../stores/BoardsStore'
import { SoundStore } from '../stores/SoundStore'

/*
 * The two page-level buttons, as components (graphics spec P0-3, row 3).
 *
 * They were inline JSX in `DominoClient`, and the component sheet has to render the real
 * thing: a sheet that copied this markup would be a second implementation of the controls,
 * passing while the shipped ones changed. Extracted unchanged -- same element, same
 * attributes, same classes -- so the page renders exactly what it rendered before.
 */

export const ArchiveButton = observer(({ levels }: { levels: LevelStore }) => (
  <button
    type='button'
    data-open-archive
    className='rounded-md border px-3 py-1 text-sm'
    onClick={() => levels.setArchiveOpen(true)}
  >
    Archive
  </button>
))

/*
 * Muting is a real requirement, not a nicety: a daily puzzle is played on a train, in a
 * queue, in a meeting -- and a game that cannot be silenced gets closed instead (spec P2-4).
 *
 * `aria-pressed` says the state, the text says it again for everyone else, and the label
 * names what the control *is* rather than what pressing it does, which is what
 * `aria-pressed` is for.
 */
export const SoundButton = observer(({ sound }: { sound: SoundStore }) => (
  <button
    type='button'
    data-mute
    aria-pressed={sound.muted}
    aria-label='Sound'
    className='control-surface rounded-md border px-3 py-1 text-sm'
    onClick={() => sound.toggle()}
  >
    {sound.muted ? 'Sound off' : 'Sound on'}
  </button>
))
