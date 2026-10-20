import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import {
    captureChallengeFailure, CHALLENGE_CAPTURE_MS, CHALLENGE_FAILURE_PREFIX,
} from '@/e2e/challengeFailure'

type Info = Parameters<typeof captureChallengeFailure>[2]
const info = (status: Info['status'] = 'failed', expectedStatus: Info['expectedStatus'] = 'passed'): Info => ({
    status, expectedStatus, project: { name: 'phone-360' },
    titlePath: ['challengeSession.spec.ts', 'Hint remains unpublished after request success and abort'],
    workerIndex: 2, retry: 0, attach: vi.fn().mockResolvedValue(undefined),
} as unknown as Info)
const probe = (created = 8, settled = 7) => ({
    created, settled, armed: null, active: false, completed: false,
    release: false, abort: false, writes: [],
})
const page = (options: {
    state?: string | null, probe?: unknown, busy?: number, path?: string,
} = {}) => ({
    evaluate: vi.fn((fn: () => unknown) => {
        vi.stubGlobal('window', {
            challengeTransaction: 'probe' in options ? options.probe : probe(),
            challengeFixture: { root: { boardsStore: { currentBoard: {
                challengeBinding: { busy: options.busy },
            } } } },
        })
        vi.stubGlobal('document', {
            querySelector: () => options.state === null ? null : {
                textContent: options.state ?? JSON.stringify({ starting: true }),
            },
            visibilityState: 'hidden', hasFocus: () => false,
        })
        vi.stubGlobal('location', { pathname: options.path ?? '/visual/challenge' })
        try { return Promise.resolve(fn()) } finally { vi.unstubAllGlobals() }
    }),
} as unknown as Page)
let warning: ReturnType<typeof vi.spyOn>
const payload = () => JSON.parse(String(warning.mock.calls[0][0]).slice(CHALLENGE_FAILURE_PREFIX.length))
const valueFor = (role: string) => payload().pages.find((entry: { role: string }) => entry.role === role).sample.value

beforeEach(() => { warning = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('challenge failure capture', () => {
    it.each([
        ['passed', 'passed'], ['skipped', 'passed'], ['failed', 'failed'],
        ['timedOut', 'timedOut'], ['interrupted', 'passed'], [undefined, 'passed'],
    ] as const)('does no capture for %s with expected status %s', async (status, expected) => {
        const main = page()
        const context = { pages: vi.fn(() => [main]) }
        const current = info(status, expected)
        // Explicit undefined must not use the factory's default status.
        current.status = status
        await captureChallengeFailure(context, main, current)
        expect(context.pages, 'no page enumeration on a non-target result').not.toHaveBeenCalled()
        expect(main.evaluate).not.toHaveBeenCalled()
        expect(warning).not.toHaveBeenCalled()
        expect(current.attach).not.toHaveBeenCalled()
    })

    it.each(['failed', 'timedOut'] as const)('captures %s throughout the spec, keeping A/B identity', async status => {
        const main = page({ state: '{"starting":true}', probe: { ...probe(11, 10), active: true }, busy: 1 })
        const other = page({ state: '{"starting":false}', probe: probe(8, 7), busy: 0 })
        const extra = page({ probe: probe(3, 3) })
        const current = info(status)
        // A is deliberately not first: page identity, not array order or focus, names it.
        await captureChallengeFailure({ pages: () => [other, main, extra] }, main, current)
        expect(warning, 'an unexpected failure emits a record').toHaveBeenCalledTimes(1)
        expect(payload().identity).toEqual({
            project: 'phone-360', titlePath: current.titlePath, workerIndex: 2, testRetry: 0,
        })
        expect(payload().originalStatus).toBe(status)
        expect(payload().pages.map((entry: { role: string }) => entry.role), 'each existing page keeps its identity')
            .toEqual(['B', 'A', 'extra-1'])
        expect(valueFor('A').state).toEqual({ status: 'available', value: { starting: true } })
        expect(valueFor('B').state).toEqual({ status: 'available', value: { starting: false } })
        expect(valueFor('B').transactions, 'an unarmed B can have outstanding work')
            .toEqual({ created: 8, settled: 7, outstanding: 1 })
        expect(valueFor('B').armedTransaction.active).toBe(false)
        expect(valueFor('A').bindingBusy).toEqual({ value: 1, meaning: 'binding operations in flight, not queue depth' })
        expect(valueFor('B').bindingBusy.value).toBe(0)
        expect(valueFor('A')).toMatchObject({ fixturePath: '/visual/challenge', visibility: 'hidden', focused: false })
        expect(warning).toHaveBeenCalledTimes(1)
        expect(String(warning.mock.calls[0][0])).toMatch(/^\[e2e challenge failure\] /)
        expect(current.attach).toHaveBeenCalledTimes(1)
        const [name, attachment] = vi.mocked(current.attach).mock.calls[0]
        expect(name).toBe('challenge-session-failure')
        expect(attachment?.contentType).toBe('application/json')
        expect(String(attachment?.body), 'line and attachment carry the same frozen payload')
            .toBe(String(warning.mock.calls[0][0]).slice(CHALLENGE_FAILURE_PREFIX.length))
    })

    it('labels armed-only flags and write count separately from lifetime totals', async () => {
        const main = page({ probe: {
            ...probe(9, 8), armed: 'meta', active: true, completed: true,
            release: true, abort: true, writes: [{ secret: 'not copied' }, {}],
        } })
        await captureChallengeFailure({ pages: () => [main] }, main, info())
        expect(valueFor('A').transactions).toEqual({ created: 9, settled: 8, outstanding: 1 })
        expect(valueFor('A').armedTransaction).toEqual({
            armed: 'meta', active: true, completed: true, release: true, abort: true, writesCount: 2,
        })
        expect(String(warning.mock.calls[0][0]), 'the armed record carries counts, not raw writes')
            .not.toContain('not copied')
    })

    it.each([undefined, NaN, Infinity])('reports an unavailable counter (%s), never zero', async settled => {
        const main = page({ probe: { ...probe(), settled } })
        await captureChallengeFailure({ pages: () => [main] }, main, info())
        expect(valueFor('A').transactions, 'missing counters stay unavailable')
            .toEqual({ status: 'unavailable', reason: 'counters-missing-or-invalid' })
    })

    it('does not invent a missing created counter or clamp a negative observed difference', async () => {
        const main = page({ probe: { ...probe(), created: undefined } })
        const other = page({ probe: probe(2, 3) })
        await captureChallengeFailure({ pages: () => [main, other] }, main, info())
        expect(valueFor('A').transactions, 'a missing created counter stays unavailable')
            .toEqual({ status: 'unavailable', reason: 'counters-missing-or-invalid' })
        expect(valueFor('B').transactions).toEqual({ created: 2, settled: 3, outstanding: -1 })
    })

    it('makes absent fixture, binding and probe data explicit', async () => {
        const main = page({ state: null, probe: undefined, path: '/a-private-page' })
        await captureChallengeFailure({ pages: () => [main] }, main, info())
        expect(valueFor('A')).toMatchObject({
            fixturePath: { status: 'unavailable', reason: 'not-challenge-fixture' },
            state: { status: 'unavailable', reason: 'fixture-state-missing' },
            bindingBusy: { status: 'unavailable', reason: 'binding-missing' },
            transactions: { status: 'unavailable', reason: 'probe-missing' },
            armedTransaction: { status: 'unavailable', reason: 'probe-missing' },
        })
        expect(String(warning.mock.calls[0][0])).not.toContain('a-private-page')
    })

    it.each(['{broken', 'null', '[]', '"text"'])('labels malformed fixture state %s', async state => {
        const main = page({ state })
        await captureChallengeFailure({ pages: () => [main] }, main, info())
        expect(valueFor('A').state, 'malformed fixture state is explicit')
            .toEqual({ status: 'unavailable', reason: 'malformed-fixture-state' })
    })

    it('does not invent a missing write list', async () => {
        const main = page({ probe: { ...probe(), writes: undefined } })
        await captureChallengeFailure({ pages: () => [main] }, main, info())
        expect(valueFor('A').armedTransaction.writesCount).toEqual({ status: 'unavailable', reason: 'writes-missing' })
    })

    it('keeps a good page when another evaluation throws, including a synchronous throw', async () => {
        const main = page()
        vi.mocked(main.evaluate).mockImplementation(() => { throw new Error('PRIVATE_ERROR') })
        const other = page()
        await expect(captureChallengeFailure({ pages: () => [main, other] }, main, info())).resolves.toBeUndefined()
        expect(payload().pages[0].sample).toEqual({ status: 'unavailable', reason: 'evaluation-failed' })
        expect(valueFor('B').transactions.outstanding).toBe(1)
        expect(String(warning.mock.calls[0][0])).not.toContain('PRIVATE_ERROR')
    })

    it('marks a missing A and an inaccessible context explicitly', async () => {
        const main = page()
        await captureChallengeFailure({ pages: () => { throw new Error('closed context') } }, main, info())
        expect(payload().enumeration).toBe('unavailable')
        expect(payload().pages, 'missing A is explicit')
            .toEqual([{ role: 'A', sample: { status: 'unavailable', reason: 'page-missing' } }])
    })

    it('keeps B if A has already closed and left the context', async () => {
        const main = page()
        const other = page()
        await captureChallengeFailure({ pages: () => [other] }, main, info())
        expect(payload().enumeration).toBe('available')
        expect(payload().pages.find((entry: { role: string }) => entry.role === 'A').sample)
            .toEqual({ status: 'unavailable', reason: 'page-missing' })
        expect(valueFor('B').transactions.outstanding).toBe(1)
    })

    it('bounds a held page at 1000ms, preserves B, and contains a late rejection', async () => {
        vi.useFakeTimers()
        let rejectRead!: (error: Error) => void
        const main = page()
        const held = new Promise<never>((_, reject) => { rejectRead = reject })
        vi.mocked(main.evaluate).mockImplementation(() => held)
        const other = page()
        const current = info()
        let finished = false
        const task = captureChallengeFailure({ pages: () => [main, other] }, main, current)
            .then(() => { finished = true })
        try {
            current.titlePath.push('later test')
            await vi.advanceTimersByTimeAsync(999)
            expect(finished).toBe(false)
            await vi.advanceTimersByTimeAsync(1)
            expect(finished, 'the entire browser capture has a one-second deadline').toBe(true)
            expect(CHALLENGE_CAPTURE_MS).toBe(1000)
            expect(payload().pages[0].sample).toEqual({ status: 'unavailable', reason: 'capture-timeout' })
            expect(valueFor('B').transactions.outstanding).toBe(1)
            expect(payload().identity.titlePath, 'identity was copied before capture awaited')
                .not.toContain('later test')
            expect(vi.getTimerCount()).toBe(0)
        } finally { rejectRead(new Error('late read')); await task }
        expect(warning).toHaveBeenCalledTimes(1)
        expect(current.attach).toHaveBeenCalledTimes(1)
    })

    it('clears the deadline after fast reads', async () => {
        vi.useFakeTimers()
        const main = page()
        await captureChallengeFailure({ pages: () => [main] }, main, info())
        expect(vi.getTimerCount(), 'no capture timer is left after success').toBe(0)
    })

    it('contains a logging failure and still attaches the payload', async () => {
        warning.mockImplementation(() => { throw new Error('stderr closed') })
        const main = page()
        const current = info()
        await expect(captureChallengeFailure({ pages: () => [main] }, main, current)).resolves.toBeUndefined()
        expect(current.attach, 'the attachment survives a logging failure').toHaveBeenCalledTimes(1)
    })

    it('contains an attachment failure and keeps the original log', async () => {
        const main = page()
        const current = info()
        vi.mocked(current.attach).mockRejectedValue(new Error('output closed'))
        await expect(captureChallengeFailure({ pages: () => [main] }, main, current)).resolves.toBeUndefined()
        expect(warning).toHaveBeenCalledTimes(1)
    })
})
