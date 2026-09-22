"use client"
import type { PlacementOutcome } from "../stores/PuzzleSession"

/**
 * What a move feels like (spec P1-5 / D10-f, extended by P2-4 in row 20d).
 *
 * Two defects sat behind this originally. `snap.mp3` played on **every** square click,
 * including clicks that placed nothing — so the sound that means "that worked" also meant
 * "that did not", which is worse than silence: the player learns to distrust it. And each
 * click constructed a fresh `Audio`, so a game accumulated one decoded media element per
 * click. Both are fixed by deciding from the *outcome* rather than the event, and by
 * keeping one element per sound.
 *
 * P2-4 adds the rest of the contract, and the parts of it that are not obvious:
 *
 *   - **Absolute `/snap.mp3`, not `snap.mp3`.** A relative source resolves against the
 *     current path, so on any route below the root the sound 404s. The repository shipped
 *     a second route until row 20a and this was live there.
 *   - **iOS unlocks audio elements individually, not globally.** An element constructed
 *     outside a gesture is refused the first time it is played, even while another element
 *     plays fine — which is exactly how the win sound was built, constructed in a store
 *     constructor and first played minutes later when a board was solved. The pool is
 *     primed inside the first `pointerdown` instead.
 *   - **Every `play()` is caught.** The autoplay policy rejects the returned promise, and
 *     an uncaught rejection is a console error in the middle of a move.
 *
 * Haptics are not a flourish here. On mobile the hardware mute switch silences the entire
 * audio channel, so for a large share of players vibration is the whole feel budget — which
 * is also why muting the game silences sound and leaves haptics alone.
 */

/**
 * Vibration durations, in milliseconds, named so the contract is readable and testable
 * rather than scattered as literals. P1-5 fixes 10 on a move and 25 on a win.
 */
export const ACCEPTED_MS = 10
export const REJECTED_MS = 25
export const WIN_MS = 25

/**
 * Absolute paths (spec P2-4).
 *
 * `new Audio('snap.mp3')` resolves against the document's URL, so it is only correct at the
 * root. Leading slash, always.
 */
export const SOUND_FILES = {
    snap: '/snap.mp3',
    /*
     * `win.mp3`, not the `winSilent.mp3` that shipped beside it (spec P1-4). Only the silent
     * file was ever referenced, so winning made no sound at all — which, together with the
     * board going inert, is why the game appeared to *freeze* at the moment it should
     * celebrate.
     */
    win: '/win.mp3',
} as const

export type SoundName = keyof typeof SOUND_FILES

/** One element per sound. Never one per click. */
const pool = new Map<SoundName, HTMLAudioElement>()

const element = (name: SoundName): HTMLAudioElement | null => {
    if (typeof Audio === 'undefined') return null
    const existing = pool.get(name)
    if (existing) return existing
    const audio = new Audio(SOUND_FILES[name])
    // Fetch the file before it is needed: the first snap is the one most likely to be late,
    // and a late snap reads as a missed tap.
    audio.preload = 'auto'
    pool.set(name, audio)
    return audio
}

/** Build the pool without playing anything. Safe to call more than once. */
export const preloadSounds = () => {
    for (const name of Object.keys(SOUND_FILES) as SoundName[]) element(name)
}

let unlocked = false

/**
 * Prime every element inside a real gesture, so iOS will let them play later.
 *
 * Each element is played and immediately paused while muted. That is the only way to mark
 * an element as user-initiated on iOS, and it has to happen to *each* of them — the win
 * sound is the one that suffers otherwise, because it is the one whose first play is
 * minutes away from any tap.
 *
 * Idempotent, and it restores mute and position afterwards so a primed element is
 * indistinguishable from an untouched one.
 */
export const unlockSounds = () => {
    if (unlocked) return
    unlocked = true
    for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
        const audio = element(name)
        if (!audio) continue
        try {
            audio.muted = true
            const started = audio.play()
            const settle = () => {
                audio.pause()
                audio.currentTime = 0
                audio.muted = false
            }
            if (started && typeof started.then === 'function') {
                void started.then(settle).catch(() => { audio.muted = false })
            } else {
                settle()
            }
        } catch { /* an element that will not prime is not worth failing a gesture over */ }
    }
}

/** For tests: forget that the pool was primed. */
export const resetSoundsForTest = () => {
    unlocked = false
    pool.clear()
}

const play = (name: SoundName) => {
    const audio = element(name)
    if (!audio) return
    try {
        // Rewind rather than ignore: a second placement while the first is still sounding
        // would otherwise be silent, and fast play is exactly when feedback matters.
        audio.currentTime = 0
        // Autoplay policy rejects until the user has interacted; every caller here is
        // downstream of a real gesture, but a rejected promise must not reach the console.
        void audio.play()?.catch(() => { })
    } catch { /* a media element that will not play is not worth failing a move over */ }
}

/**
 * Buzz for `ms`, where supported.
 *
 * Guarded twice over: `navigator.vibrate` is absent on desktop Safari and on every desktop
 * browser, and throws in some embedded webviews.
 */
export const vibrate = (ms: number) => {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    try { navigator.vibrate(ms) } catch { /* not worth failing a move over */ }
}

/**
 * The board accepted the move: a piece went down, or a piece came up.
 *
 * Named for acceptance rather than placement because it covers both, and that is a
 * deliberate decision rather than an oversight in the routing below. A removal is a real
 * action that changed the board; answering it with silence would leave it feeling exactly
 * like the missed tap that D10-f is about. The snap here means "the board did what you
 * asked", which is true of a removal and was never true of the refused clicks that used to
 * play it.
 */
export const acceptedFeedback = (muted = false) => {
    if (!muted) play('snap')
    vibrate(ACCEPTED_MS)
}

/**
 * The board refused a move. No sound — the shake is the message.
 *
 * Deliberately longer than an acceptance: a correction should not feel like a confirmation,
 * and haptics are the only channel here, so the duration is carrying the whole distinction.
 */
export const rejectedFeedback = () => {
    vibrate(REJECTED_MS)
}

/** Winning. Longer haptics than a placement, per P1-5. */
export const winFeedback = (muted = false) => {
    if (!muted) play('win')
    vibrate(WIN_MS)
}

/**
 * Respond to what an input actually did.
 *
 * `none` is a refusal — the player asked for something the board would not do. Everything
 * else either changed the board or changed what is offered, and neither deserves a
 * correction buzz.
 */
export const feedbackFor = (outcome: PlacementOutcome, muted = false) => {
    if (outcome === 'placed' || outcome === 'removed') acceptedFeedback(muted)
    else if (outcome === 'none') rejectedFeedback()
}
