// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StoreWrapper } from '@/app/provider'
import { useStores } from '@/app/hooks/useStore'
import { RootStore } from '@/app/stores/RootStore'

/**
 * P0-2: the store graph must be per-mount, not a module singleton.
 *
 * A module-scope instance is still evaluated during SSR, so it would be one store shared by
 * every request in the server process, with undisposed MobX reactions. These tests pin the
 * boundary that prevents that.
 */

afterEach(cleanup)

const seen: RootStore[] = []

const Probe = ({ label }: { label: string }) => {
    const store = useStores()
    seen.push(store)
    return <span data-testid={label}>{String(seen.indexOf(store))}</span>
}

describe('StoreWrapper', () => {
    it('exposes a RootStore with both sub-stores', () => {
        render(<StoreWrapper><Probe label="a" /></StoreWrapper>)
        const store = seen.at(-1)!
        expect(store).toBeInstanceOf(RootStore)
        expect(store.boardsStore).toBeDefined()
        expect(store.sizeStore).toBeDefined()
    })

    it('preserves store identity across re-renders of the same provider', () => {
        const tree = (label: string) => (
            <StoreWrapper><Probe label={label} /></StoreWrapper>
        )
        const { rerender } = render(tree('a'))
        const first = seen.at(-1)!

        // Re-render the same provider instance twice; the lazy useState initialiser must
        // not run again.
        rerender(tree('a'))
        rerender(tree('a'))

        expect(seen.at(-1)).toBe(first)
        expect(seen.filter(s => s === first).length).toBe(3)
    })

    it('gives separate provider mounts separate stores', () => {
        render(
            <>
                <StoreWrapper><Probe label="a" /></StoreWrapper>
                <StoreWrapper><Probe label="b" /></StoreWrapper>
            </>
        )
        const [a, b] = [screen.getByTestId('a'), screen.getByTestId('b')]
        // Each Probe reported its own store's index in `seen`; different indices means
        // different instances.
        expect(a.textContent).not.toBe(b.textContent)

        const stores = seen.slice(-2)
        expect(stores[0]).not.toBe(stores[1])
        expect(stores[0].boardsStore).not.toBe(stores[1].boardsStore)
        expect(stores[0].sizeStore).not.toBe(stores[1].sizeStore)
    })

    it('isolates state between mounts', () => {
        render(
            <>
                <StoreWrapper><Probe label="a" /></StoreWrapper>
                <StoreWrapper><Probe label="b" /></StoreWrapper>
            </>
        )
        const [first, second] = seen.slice(-2)

        first.boardsStore.setSelectedPiece(2)
        expect(first.boardsStore.selectedPiece).toBe(2)
        expect(second.boardsStore.selectedPiece).toBe(1)
    })
})

describe('useStores outside a provider', () => {
    it('throws a clear error rather than falling back to a shared singleton', () => {
        // React logs the error boundary-less throw; silence it for this assertion.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { })
        expect(() => render(<Probe label="orphan" />))
            .toThrow(/must be used within a <StoreWrapper>/)
        spy.mockRestore()
    })
})

describe('RootStore module', () => {
    it('exports no module-scope instance', async () => {
        const mod = await import('@/app/stores/RootStore')
        expect(Object.keys(mod)).toEqual(['RootStore'])
    })
})
