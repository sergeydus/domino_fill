"use client"
import type { PlacementOutcome } from "../stores/PuzzleSession"

/**
 * What a move feels like (spec P1-5, D10-f).
 *
 * Two defects sat behind this. `snap.mp3` played on **every** square click, including
 * clicks that placed nothing — so the sound that means "that worked" also meant "that did
 * not", which is worse than silence: the player learns to distrust it. And each click
 * constructed a fresh `Audio`, so a game accumulated one decoded media element per click.
 *
 * Both are fixed by deciding from the *outcome* rather than the event, and by keeping one
 * element per sound.
 *
 * Haptics are not a flourish here. On mobile the hardware mute switch silences the entire
 * audio channel, so for a large share of players vibration is the whole feel budget.
 */

/** One element per sound, created on first use. Never one per click. */
const cache = new Map<string, HTMLAudioElement>()

const sound = (file: string): HTMLAudioElement | null => {
    if (typeof Audio === 'undefined') return null
    const existing = cache.get(file)
    if (existing) return existing
    const audio = new Audio(file)
    cache.set(file, audio)
    return audio
}

const play = (file: string) => {
    const audio = sound(file)
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

/** A placement landed: the one case `snap.mp3` was ever supposed to mean. */
export const placedFeedback = () => {
    play('snap.mp3')
    vibrate(10)
}

/** The board refused a move. No sound — the shake is the message. */
export const rejectedFeedback = () => {
    vibrate(25)
}

/** Winning. Louder haptics than a placement, per P1-5. */
export const winFeedback = () => {
    vibrate(25)
}

/**
 * Respond to what an input actually did.
 *
 * `none` is a refusal — the player asked for something the board would not do. Everything
 * else either changed the board or changed what is offered, and neither deserves a
 * correction buzz.
 */
export const feedbackFor = (outcome: PlacementOutcome) => {
    if (outcome === 'placed' || outcome === 'removed') placedFeedback()
    else if (outcome === 'none') rejectedFeedback()
}
