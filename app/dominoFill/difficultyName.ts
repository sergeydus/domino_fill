/**
 * What each difficulty is called, where a player reads it: on the difficulty buttons, on
 * the completion card (graphics P2-3), which names the puzzle just solved, and on the
 * challenge's cover (slice 3a). `normal` is "Medium" on screen.
 *
 * Its own module, not the slider's: it is data, read by components that have nothing else
 * to do with the slider, and tests that stub the slider still need the names.
 */
export const DIFFICULTY_NAME = { easy: 'Easy', normal: 'Medium', hard: 'Hard' } as const
