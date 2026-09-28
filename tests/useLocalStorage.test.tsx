// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useLocalStorage } from '@/app/hooks/useLocalStorage'

/**
 * Deliberate exception to P0-10's "characterise existing behaviour only" rule:
 * this hook is NEW in P0-1, so these tests assert its intended contract rather than
 * the old `useLocalhost` behaviour (which read storage during render and would crash SSR).
 *
 * The contract that matters: storage is touched ONLY from an effect, and every access is
 * exception-safe. Guarding on `typeof localStorage !== 'undefined'` is specifically NOT
 * sufficient — Node >= 22 defines an inert global whose `getItem` is not a function, which
 * is what broke the production build (spec D1).
 */

const Probe = ({ initial = 'fallback' }: { initial?: string }) => {
    const [value] = useLocalStorage('k', initial)
    return <span data-testid="v">{String(value)}</span>
}

const read = () => screen.getByTestId('v').textContent

// Node >= 22 defines its own inert global `localStorage`, and under vitest it shadows
// jsdom's Storage — `window.localStorage.setItem` is not a function out of the box. That is
// the very hazard this hook guards against, so the harness must not depend on the ambient
// implementation: install a deterministic in-memory Storage instead.
const memoryStorage = (): Storage => {
    let map = new Map<string, string>()
    return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => { map.set(k, String(v)) },
        removeItem: (k: string) => { map.delete(k) },
        clear: () => { map = new Map() },
        key: (i: number) => [...map.keys()][i] ?? null,
        get length() { return map.size },
    } as Storage
}

const useStorage = (impl: unknown) => {
    Object.defineProperty(window, 'localStorage', {
        configurable: true, writable: true, value: impl,
    })
}

beforeEach(() => { useStorage(memoryStorage()) })

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe('useLocalStorage', () => {
    it('reads a previously stored value', () => {
        window.localStorage.setItem('k', JSON.stringify('stored'))
        render(<Probe />)
        expect(read()).toBe('stored')
    })

    it('falls back to initialValue when the key is absent', () => {
        render(<Probe />)
        expect(read()).toBe('fallback')
    })

    it("survives Node >= 22's inert localStorage where getItem is not a function", () => {
        // The exact shape that broke the production build (spec D1).
        useStorage({})
        expect(() => render(<Probe />)).not.toThrow()
        expect(read()).toBe('fallback')
    })

    it('survives localStorage being absent entirely', () => {
        useStorage(undefined)
        expect(() => render(<Probe />)).not.toThrow()
        expect(read()).toBe('fallback')
    })

    it('survives a throwing localStorage (blocked site data / private mode)', () => {
        useStorage({
            getItem() { throw new Error('denied') },
            setItem() { throw new Error('denied') },
        })
        expect(() => render(<Probe />)).not.toThrow()
        expect(read()).toBe('fallback')
    })

    it('falls back rather than throwing on malformed JSON', () => {
        window.localStorage.setItem('k', '{not json')
        render(<Probe />)
        expect(read()).toBe('fallback')
    })

    it('persists what it sets', () => {
        const Writer = () => {
            const [value, setValue] = useLocalStorage('k', 'a')
            return <button onClick={() => setValue('b')}>{value}</button>
        }
        render(<Writer />)
        act(() => { screen.getByRole('button').click() })

        expect(screen.getByRole('button').textContent).toBe('b')
        expect(window.localStorage.getItem('k')).toBe(JSON.stringify('b'))
    })

    it('keeps the in-memory value when the write fails', () => {
        useStorage({
            getItem: () => null,
            setItem() { throw new Error('quota') },
        })
        const Writer = () => {
            const [value, setValue] = useLocalStorage('k', 'a')
            return <button onClick={() => setValue('b')}>{value}</button>
        }
        render(<Writer />)
        expect(() => act(() => { screen.getByRole('button').click() })).not.toThrow()
        expect(screen.getByRole('button').textContent).toBe('b')
    })
})

describe('SSR safety', () => {
    it('does not touch storage during render', () => {
        // renderToString runs no effects — exactly the server path. If the hook read during
        // render (as the old useLocalhost did), this would call getItem, and on the real
        // server it would throw "getItem is not a function".
        const getItem = vi.fn(() => null)
        useStorage({ getItem, setItem: vi.fn() })

        expect(() => renderToString(<Probe />)).not.toThrow()
        expect(getItem).not.toHaveBeenCalled()
    })

    it('renders initialValue on the server', () => {
        useStorage({ getItem: () => JSON.stringify('stored'), setItem: vi.fn() })
        // The server cannot know the stored value; it must emit the fallback so that the
        // first client render matches and hydration does not mismatch.
        expect(renderToString(<Probe />)).toContain('fallback')
    })
})
