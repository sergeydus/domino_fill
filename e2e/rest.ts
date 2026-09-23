import { expect, type Page } from '@playwright/test'

/**
 * Wait until nothing `motion` animates inside `scope` is still moving (graphics spec P0-3/4).
 *
 * **At rest is a state, not a pause.** Pieces enter with an animation and the completion
 * card fades in. "Two consecutive screenshots agree" was the first definition of settled,
 * and it was flaky for a reason worth keeping: the server-rendered page shows every piece at
 * `motion`'s starting state -- `opacity: 0`, offset -- and nothing moves until hydration, so
 * two identical frames can arrive before the animations have begun. So: wait until every
 * inline opacity `motion` wrote is 1 and every inline transform is `none`.
 *
 * Polled as the list of elements still moving, so a page that never settles names them.
 */
export const waitForRest = (page: Page, scope = 'body') =>
    expect.poll(() => page.locator(scope).first().evaluate(root =>
        [...root.querySelectorAll<HTMLElement>('[style]')]
            .filter(el => !((el.style.opacity === '' || el.style.opacity === '1')
                && (el.style.transform === '' || el.style.transform === 'none')))
            .map(el => `${el.closest('[data-specimen]')?.getAttribute('data-specimen') ?? ''} ` +
                `${el.tagName} style="${el.getAttribute('style')}"`)),
    { message: 'the page never came to rest', timeout: 15_000 }).toEqual([])
