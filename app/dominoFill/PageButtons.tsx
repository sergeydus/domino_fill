"use client"
import { observer } from 'mobx-react'
import { LevelStore } from '../stores/BoardsStore'
import { SoundStore } from '../stores/SoundStore'
import type { ControlStore } from '../stores/ControlStore'
import { control } from '../controls'

/*
 * The two page-level buttons, as components (graphics spec P0-3, row 3).
 *
 * They were inline JSX in `DominoClient`, and the component sheet has to render the real
 * thing: a sheet that copied this markup would be a second implementation of the controls,
 * passing while the shipped ones changed. Extracted unchanged -- same element, same
 * attributes, same classes -- so the page renders exactly what it rendered before.
 *
 * Both are raised controls (UI row 3): they were row 14's quiet variant, bordered and
 * unfilled, which UI-SPEC's six variants have no place for.
 */

export const ArchiveButton = observer(({ levels }: { levels: LevelStore }) => (
  <button
    type='button'
    data-open-archive
    className={control('raised')}
    onClick={() => levels.setArchiveOpen(true)}
  >
    Archive
  </button>
))

/**
 * Reopens the day's results (slice 3b, rule 9; user, 2026-10-12), beside Archive: shown on
 * a challenge day once any of its boards has a result.
 */
export const ResultsButton = observer(({ levels }: { levels: LevelStore }) =>
  levels.challengeResults?.anyResult ? (
    <button
      type='button'
      data-open-results
      className={control('raised')}
      onClick={() => levels.openResults()}
    >
      Results
    </button>
  ) : null)

/**
 * The streak beside Archive (slice 3b, rule 13; user, 2026-10-12): text, not a control, and
 * only for a player who has played the challenge (D9), so a broken streak reads "🔥 0".
 * The emoji is decoration; the words are for everyone who can't see it.
 */
export const StreakCount = observer(({ levels }: { levels: LevelStore }) => {
  const streak = levels.rootStore.challenge?.streak
  if (!streak?.playedEver) return null
  return (
    <span data-streak-count className='text-body tabular-nums'>
      <span aria-hidden='true'>🔥 {streak.streak}</span>
      <span className='sr-only'>{streak.streak}-day streak</span>
    </span>
  )
})

/*
 * Muting is a real requirement, not a nicety: a daily puzzle is played on a train, in a
 * queue, in a meeting -- and a game that cannot be silenced gets closed instead (spec P2-4).
 *
 * `aria-pressed` says the state, the text says it again for everyone else, and the label
 * names what the control *is* rather than what pressing it does, which is what
 * `aria-pressed` is for.
 *
 * **Pressed is sound on** (graphics spec P1-6, row 12). It was pressed when *muted*, so a
 * screen reader announced "Sound, toggle button, pressed" exactly when there was none: the
 * name is the thing, and pressed means the thing is on. It went unnoticed while nothing on
 * screen showed the pressed state; P1-6 draws every toggle's pressed state (held down since UI row 3), and
 * drawing it on "Sound off" would have made the inversion visible to everyone.
 */
/*
 * The control mode (NEXT-STEPS.md, Pick a piece), beside Sound and built like it: the name
 * is the thing, and pressed means the thing is on. Pressed is Pick a piece; unpressed is
 * the default drag controls.
 *
 * **Focus is never stranded.** Turning the mode off takes the picker away, and the picker
 * can hold focus while this is activated -- a browser that does not focus a clicked button
 * (Safari) leaves it where it was. So when focus was on the picker, it moves here: the one
 * programmatic focus move the contract allows. Otherwise focus is left alone.
 */
export const ControlModeButton = observer(({ controls }: { controls: ControlStore }) => (
  <button
    type='button'
    data-controls-mode
    aria-pressed={controls.mode === 'pick'}
    className={control('raised')}
    onClick={e => {
      const onPicker = document.activeElement?.closest('[data-piece-picker]') != null
      controls.toggleMode()
      if (onPicker && controls.mode !== 'pick') e.currentTarget.focus()
    }}
  >
    Pick a piece
  </button>
))

export const SoundButton = observer(({ sound }: { sound: SoundStore }) => (
  <button
    type='button'
    data-mute
    aria-pressed={!sound.muted}
    aria-label='Sound'
    className={control('raised')}
    onClick={() => sound.toggle()}
  >
    {sound.muted ? 'Sound off' : 'Sound on'}
  </button>
))
