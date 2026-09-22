import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'

/**
 * The mute control, in a browser (spec P2-4, row 20d).
 *
 * The pool's own behaviour is pinned in `tests/sound.test.ts`. What only a browser shows:
 * that the control is reachable and announced like the rest of the chrome, that the
 * preference is still there after a reload -- through real `localStorage`, not a stub --
 * and that the sound files the page asks for actually exist on the server, which is the
 * failure a relative path produces and which no unit test can see.
 */

const mute = (page: Page) => page.locator('[data-mute]')

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('is a real button that says which state it is in', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Sound' })).toBeVisible()
    await expect(mute(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(mute(page)).toHaveText('Sound on')

    await mute(page).click()

    // Both channels: `aria-pressed` for a screen reader, the word for everyone else.
    await expect(mute(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(mute(page)).toHaveText('Sound off')
})

test('remembers the choice across a reload', async ({ page }) => {
    // A setting that resets every visit is one the player has to find every visit -- and a
    // daily puzzle is played in exactly the places where that matters.
    await mute(page).click()
    await expect(mute(page)).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await page.locator('[data-board-shell]').waitFor()

    await expect(mute(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(mute(page)).toHaveText('Sound off')
})

test('every sound the game names is actually served', async ({ page, request }) => {
    /*
     * The failure a relative path produces, and the reason P2-4 asks for absolute ones:
     * `new Audio('snap.mp3')` resolves against the document URL, so it 404s on any route
     * below the root -- and a 404 on a media element is silent in every sense. Nothing
     * throws, nothing logs, the game simply stops making noise.
     */
    for (const file of ['/snap.mp3', '/win.mp3']) {
        const response = await request.get(new URL(file, page.url()).toString())
        expect(response.status(), `${file} is not served`).toBe(200)
        expect(response.headers()['content-type']).toContain('audio')
    }
})

test('the pool is primed by the first gesture, not left for iOS to refuse', async ({ page }) => {
    /*
     * The wiring, which is the part `tests/sound.test.ts` cannot see: it proves
     * `unlockSounds` primes every element, and says nothing about whether the app ever
     * calls it. Found by mutation -- deleting the `pointerdown` listener passed the whole
     * suite, and the iOS fix with it.
     *
     * `Audio` is replaced before the page loads so the priming is observable at all; the
     * pool is module-private by design and there is nothing to read from outside.
     */
    await page.addInitScript(() => {
        const w = window as unknown as { __audio: { src: string, plays: number }[] }
        w.__audio = []
        class Recorder {
            src: string
            preload = ''
            muted = false
            currentTime = 0
            record: { src: string, plays: number }
            constructor(src: string) {
                this.src = src
                this.record = { src, plays: 0 }
                w.__audio.push(this.record)
            }
            play() { this.record.plays++; return Promise.resolve() }
            pause() { }
        }
        ;(window as unknown as { Audio: unknown }).Audio = Recorder
    })
    await page.goto('/')
    await page.locator('[data-board-shell]').waitFor()

    const played = () => page.evaluate(() =>
        (window as unknown as { __audio: { src: string, plays: number }[] }).__audio
            .map(a => `${a.src}:${a.plays}`).sort())

    // Preloaded, but nothing has been primed: no gesture has happened yet.
    expect(await played()).toEqual(['/snap.mp3:0', '/win.mp3:0'])

    // One real gesture anywhere on the page.
    await page.mouse.move(5, 5)
    await page.mouse.down()
    await page.mouse.up()

    /*
     * Both elements, which is the whole point: iOS unlocks them individually, so priming
     * only the sound that happens to play first leaves the win sound refused minutes later
     * -- exactly the shape the win sound had before this row.
     */
    expect(await played()).toEqual(['/snap.mp3:1', '/win.mp3:1'])
})

/**
 * Install a recording `Audio` before the page loads.
 *
 * The pool is module-private by design, so this is the only way its behaviour is
 * observable from outside. `refuse` is read at call time so a test can decide, mid-run,
 * that the browser has started allowing playback -- which is what the autoplay policy
 * does once it decides an interaction was real.
 */
const recordAudio = async (page: Page, { refuse = false } = {}) => {
    await page.addInitScript((startRefusing: boolean) => {
        const w = window as unknown as {
            __audio: { src: string, plays: number, pauses: number, muted: boolean }[]
            __refuse: boolean
        }
        w.__audio = []
        w.__refuse = startRefusing
        class Recorder {
            src: string
            preload = ''
            currentTime = 0
            record: { src: string, plays: number, pauses: number, muted: boolean }
            constructor(src: string) {
                this.src = src
                this.record = { src, plays: 0, pauses: 0, muted: false }
                w.__audio.push(this.record)
            }
            get muted() { return this.record.muted }
            set muted(value: boolean) { this.record.muted = value }
            play() {
                this.record.plays++
                return w.__refuse
                    ? Promise.reject(new Error('NotAllowedError'))
                    : Promise.resolve()
            }
            pause() { this.record.pauses++ }
        }
        ;(window as unknown as { Audio: unknown }).Audio = Recorder
    }, refuse)
}

const audioState = (page: Page) => page.evaluate(() =>
    (window as unknown as {
        __audio: { src: string, plays: number, pauses: number, muted: boolean }[]
    }).__audio.map(a => `${a.src} plays=${a.plays} pauses=${a.pauses} muted=${a.muted}`).sort())

test('a keyboard player gets sound too', async ({ page }) => {
    /*
     * Row 20d listened for `pointerdown` alone (fixed in row 20i). The whole of P1-8 is
     * that this game is playable without a pointer -- the board is a grid with roving
     * focus, every control is a real button -- so someone playing that way would have had
     * no sound at all for the entire session, including the win they were playing for.
     */
    await recordAudio(page)
    await page.goto('/')
    await page.locator('[data-board-shell]').waitFor()

    // A modifier on its own is not an activating gesture, so priming on one would spend
    // the attempt on a refusal.
    await page.keyboard.down('Shift')
    await page.keyboard.up('Shift')
    expect(await audioState(page)).toEqual([
        '/snap.mp3 plays=0 pauses=0 muted=false',
        '/win.mp3 plays=0 pauses=0 muted=false',
    ])

    // A real key, and no pointer event anywhere in this test.
    await page.keyboard.press('Tab')
    await expect.poll(() => audioState(page)).toEqual([
        '/snap.mp3 plays=1 pauses=1 muted=false',
        '/win.mp3 plays=1 pauses=1 muted=false',
    ])
})

test('a refused priming is retried, not remembered forever', async ({ page }) => {
    /*
     * Row 20d marked the pool primed *before* any `play()` resolved, so a refusal was
     * recorded as a success and no later gesture ever tried again: the player's first tap
     * decided permanently whether the game had audio. A refusal is the ordinary case here
     * -- it is what a browser does to a gesture it does not consider activating.
     */
    await recordAudio(page, { refuse: true })
    await page.goto('/')
    await page.locator('[data-board-shell]').waitFor()

    await page.mouse.move(5, 5)
    await page.mouse.down()
    await page.mouse.up()
    await expect.poll(() => audioState(page), { message: 'refused, and left muted' }).toEqual([
        '/snap.mp3 plays=1 pauses=0 muted=false',
        '/win.mp3 plays=1 pauses=0 muted=false',
    ])

    // The browser changes its mind, as it does once it accepts an interaction as real.
    await page.evaluate(() => { (window as unknown as { __refuse: boolean }).__refuse = false })
    await page.keyboard.press('Tab')

    await expect.poll(() => audioState(page), { message: 'the next gesture must retry' }).toEqual([
        '/snap.mp3 plays=2 pauses=1 muted=false',
        '/win.mp3 plays=2 pauses=1 muted=false',
    ])
})

test('the control does not cost the board any height', async ({ page }) => {
    /*
     * It shares the Archive row deliberately. Every `data-chrome` row is subtracted from
     * the board's height budget, and at 1280x800 an 8x8 is already within a few pixels of
     * the 38px minimum cell -- row 18d measured a separate row putting it exactly on the
     * floor.
     */
    const rows = await page.locator('[data-chrome]').count()
    const shared = page.locator('[data-chrome]', { has: page.locator('[data-mute]') })
    await expect(shared).toHaveCount(1)
    await expect(shared.locator('[data-open-archive]')).toHaveCount(1)
    expect(rows).toBeLessThanOrEqual(6)
})
