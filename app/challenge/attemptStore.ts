import type { PuzzleDefinition } from '../stores/PuzzleDefinition'
import { progressFor, type PuzzleProgress } from '../stores/progressStorage'
import { isAttempt, type Attempt, type Step } from './attempt'

/**
 * Where challenge attempts are kept (Ruleset v1, rules 13 to 16, in NEXT-STEPS).
 *
 * **IndexedDB, one transaction per change.** A change reads the attempt, runs the pure step
 * from `attempt.ts` on it, and writes what it returns, all inside one `readwrite`
 * transaction. IndexedDB runs overlapping `readwrite` transactions one at a time across every
 * tab of the origin, so no other tab can read between this one's read and its write: two
 * tabs can't both start an attempt, lose a flag, or fix two results. (That scheduling is the
 * spec's; `e2e/challengeStorage.spec.ts` measures it in Chromium.)
 *
 * **Saved means the transaction completed** (rule 16). A request's `success` isn't enough --
 * the transaction can still abort after it -- so a change reports `committed` only on the
 * transaction's `complete`.
 *
 * **The fallback is `localStorage`, uncoordinated** (rule 15). Where IndexedDB doesn't open,
 * the tab keeps attempts there instead, still timed. Nothing coordinates two tabs in it, and
 * the losses that allows are accepted (the user, 2026-10-09: "we just save and the user will
 * lose it, no big deal"). Each tab picks its store when it opens and keeps it.
 *
 * Nothing here is ever deleted: attempts sit outside progress's 14-day cleanup (D6).
 */

export const DB_NAME = 'dominoFill.challenge'
const DB_VERSION = 1
const ATTEMPTS = 'attempts'
const META = 'meta'
const LEGACY = 'legacy'

/** The store sends saved puzzle-ID notices here; the coordinator listens. */
export const CHANNEL = 'dominoFill.challenge'

export const LOCAL_ATTEMPT_PREFIX = 'dominoFill.challenge.v1.attempt.'
export const LOCAL_LEGACY_KEY = 'dominoFill.challenge.v1.legacy'

/**
 * A change's outcome. `committed` means the backend applied `attempt`; in memory this is
 * not a durable save. When it is false,
 * nothing was saved, and `attempt` is the record as it was read.
 */
export type Outcome = { readonly committed: boolean, readonly changed: boolean, readonly attempt: Attempt | null }

/**
 * The legacy check's record (rule 13): the boards played before the challenge, and, by
 * existing at all, that the check ran. One value, so the marks and the done flag are written
 * together or not at all.
 */
export type Legacy = { readonly checked: true, readonly marks: readonly string[] }

export type LegacyOutcome = { readonly committed: boolean, readonly legacy: Legacy | null }

export interface AttemptStore {
    readonly kind: 'indexeddb' | 'localStorage' | 'memory'
    read(puzzleId: string): Promise<Attempt | null>
    /** All validated, key-bound attempts; null on read failure, with partial results discarded. */
    readAll(): Promise<readonly Attempt[] | null>
    /** Read, step, write if the step changed it -- as one transaction where there is one. */
    change(puzzleId: string, step: (current: Attempt | null) => Step): Promise<Outcome>
    /**
     * Run the legacy check once. `scan` is called only if it has never run, inside the
     * transaction, and returns the puzzle ids to mark.
     */
    legacyCheck(scan: () => readonly string[]): Promise<LegacyOutcome>
    readLegacy(): Promise<Legacy | null>
    close(): void
}

const isLegacy = (value: unknown): value is Legacy => {
    if (typeof value !== 'object' || value === null) return false
    const l = value as Record<string, unknown>
    return l.checked === true && Array.isArray(l.marks) && l.marks.every(m => typeof m === 'string')
}

/**
 * The boards to mark as played before the challenge (rule 13): every stored progress record
 * that is valid for its own board's definition, an empty board included. A record exists
 * only because the board changed, so an emptied one (place, then Reset) was played too
 * (codex reproduced it). A record with no definition given isn't marked.
 */
export const legacyMarks = (
    definitions: readonly PuzzleDefinition[],
    progress: Readonly<Record<string, PuzzleProgress>>,
): string[] => definitions
    .filter(definition => progressFor(progress[definition.puzzleId], definition) !== null)
    .map(definition => definition.puzzleId)

/**
 * A stored value read under `puzzleId`'s key, if it is an attempt *of that puzzle*. A record
 * is bound to its key: an otherwise valid record of another board, filed under this one's
 * key, is no attempt here, or Start would resume the wrong puzzle (codex reproduced it).
 */
const attemptAt = (value: unknown, puzzleId: string): Attempt | null =>
    isAttempt(value) && value.puzzleId === puzzleId ? value : null

/** Whether a step's record may be written under `puzzleId`'s key. */
const belongs = (attempt: Attempt, puzzleId: string): boolean => attempt.puzzleId === puzzleId

/** Tell other tabs. Best effort: a missing channel costs a re-read on focus, not a result. */
const notify = (puzzleId: string) => {
    try {
        const channel = new BroadcastChannel(CHANNEL)
        channel.postMessage({ puzzleId })
        channel.close()
    } catch {
        // No BroadcastChannel here.
    }
}

/* -------------------------------------------------------------- IndexedDB */

const indexedDbStore = (db: IDBDatabase): AttemptStore => ({
    kind: 'indexeddb',

    read: puzzleId => new Promise(resolve => {
        try {
            const request = db.transaction(ATTEMPTS, 'readonly').objectStore(ATTEMPTS).get(puzzleId)
            request.onsuccess = () => resolve(attemptAt(request.result, puzzleId))
            request.onerror = () => resolve(null)
        } catch {
            resolve(null)
        }
    }),

    readAll: () => new Promise(resolve => {
        const attempts: Attempt[] = []
        try {
            const transaction = db.transaction(ATTEMPTS, 'readonly')
            // A cursor request may succeed and the transaction still abort. Only a complete
            // transaction supplies history; a partial list must not hide unfinished attempts.
            transaction.oncomplete = () => resolve(attempts)
            transaction.onabort = () => resolve(null)
            transaction.onerror = () => resolve(null)
            const request = transaction.objectStore(ATTEMPTS).openCursor()
            request.onsuccess = () => {
                const cursor = request.result
                if (!cursor) return
                const attempt = typeof cursor.key === 'string' ? attemptAt(cursor.value, cursor.key) : null
                if (attempt) attempts.push(attempt)
                cursor.continue()
            }
        } catch {
            resolve(null)
        }
    }),

    change: (puzzleId, step) => new Promise(resolve => {
        let read: Attempt | null = null
        let stepped: Step = { next: null, changed: false }
        let transaction: IDBTransaction
        try {
            transaction = db.transaction(ATTEMPTS, 'readwrite')
        } catch {
            resolve({ committed: false, changed: false, attempt: null })
            return
        }
        const store = transaction.objectStore(ATTEMPTS)
        const request = store.get(puzzleId)
        request.onsuccess = () => {
            read = attemptAt(request.result, puzzleId)
            // Inside the transaction, so no other tab can write between this read and the
            // put. A step that throws aborts the transaction, and nothing is saved.
            stepped = step(read)
            if (stepped.changed && stepped.next) {
                // Never file a record under another puzzle's key: abort, and nothing is saved.
                if (!belongs(stepped.next, puzzleId)) throw new Error(`${stepped.next.puzzleId} under ${puzzleId}`)
                store.put(stepped.next, puzzleId)
            }
        }
        transaction.oncomplete = () => {
            if (stepped.changed) notify(puzzleId)
            resolve({ committed: true, changed: stepped.changed, attempt: stepped.next })
        }
        transaction.onabort = () => resolve({ committed: false, changed: false, attempt: read })
    }),

    legacyCheck: scan => new Promise(resolve => {
        let legacy: Legacy | null = null
        let transaction: IDBTransaction
        try {
            transaction = db.transaction(META, 'readwrite')
        } catch {
            resolve({ committed: false, legacy: null })
            return
        }
        const store = transaction.objectStore(META)
        const request = store.get(LEGACY)
        request.onsuccess = () => {
            // Already run, by this tab or another: its marks stand, and nothing is rescanned.
            if (isLegacy(request.result)) {
                legacy = request.result
                return
            }
            legacy = { checked: true, marks: [...scan()] }
            store.put(legacy, LEGACY)
        }
        transaction.oncomplete = () => resolve({ committed: true, legacy })
        transaction.onabort = () => resolve({ committed: false, legacy: null })
    }),

    readLegacy: () => new Promise(resolve => {
        try {
            const request = db.transaction(META, 'readonly').objectStore(META).get(LEGACY)
            request.onsuccess = () => resolve(isLegacy(request.result) ? request.result : null)
            request.onerror = () => resolve(null)
        } catch {
            resolve(null)
        }
    }),

    close: () => db.close(),
})

/**
 * Open the IndexedDB store, or null where IndexedDB doesn't open or can't complete a
 * transaction (some private modes). `factory` is an argument so tests can give each case its
 * own in-memory IndexedDB.
 */
export const openIndexedDbStore = (
    factory: IDBFactory | undefined = globalThis.indexedDB,
    name: string = DB_NAME,
): Promise<AttemptStore | null> => new Promise(resolve => {
    if (!factory) {
        resolve(null)
        return
    }
    let request: IDBOpenDBRequest
    try {
        request = factory.open(name, DB_VERSION)
    } catch {
        resolve(null)
        return
    }
    request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(ATTEMPTS)) db.createObjectStore(ATTEMPTS)
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
    }
    request.onerror = () => resolve(null)
    request.onsuccess = () => {
        const db = request.result
        // Opening isn't enough: the store is chosen on a transaction completing.
        try {
            const probe = db.transaction(META, 'readonly')
            probe.objectStore(META).get(LEGACY)
            probe.oncomplete = () => resolve(indexedDbStore(db))
            probe.onabort = () => {
                db.close()
                resolve(null)
            }
        } catch {
            db.close()
            resolve(null)
        }
    }
})

/* ----------------------------------------------------------- localStorage */

const parse = (raw: string | null): unknown => {
    if (raw === null) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/**
 * The fallback: one key per attempt, and one for the legacy check. Saved means `setItem`
 * returned without throwing. `storage` is null where there is no usable `localStorage`
 * either, and then nothing is ever saved.
 */
export const localStorageStore = (storage: Storage | null): AttemptStore => {
    const get = (key: string): unknown => {
        try {
            return storage ? parse(storage.getItem(key)) : null
        } catch {
            return null
        }
    }
    const set = (key: string, value: unknown): boolean => {
        if (!storage) return false
        try {
            storage.setItem(key, JSON.stringify(value))
            return true
        } catch {
            return false
        }
    }
    const readAttempt = (puzzleId: string): Attempt | null => {
        return attemptAt(get(LOCAL_ATTEMPT_PREFIX + puzzleId), puzzleId)
    }
    const readLegacy = (): Legacy | null => {
        const value = get(LOCAL_LEGACY_KEY)
        return isLegacy(value) ? value : null
    }
    return {
        kind: 'localStorage',
        read: async puzzleId => readAttempt(puzzleId),
        readAll: async () => {
            if (!storage) return null
            const attempts: Attempt[] = []
            try {
                const length = storage.length
                for (let index = 0; index < length; index++) {
                    const key = storage.key(index)
                    if (!key?.startsWith(LOCAL_ATTEMPT_PREFIX)) continue
                    // Read directly: get() deliberately conflates a failed single read with
                    // missing data, but enumeration must report an unreadable scan for retry.
                    const attempt = attemptAt(parse(storage.getItem(key)), key.slice(LOCAL_ATTEMPT_PREFIX.length))
                    if (attempt) attempts.push(attempt)
                }
                return attempts
            } catch {
                return null
            }
        },
        change: async (puzzleId, step) => {
            const read = readAttempt(puzzleId)
            let stepped: Step
            try {
                stepped = step(read)
            } catch {
                return { committed: false, changed: false, attempt: read }
            }
            if (!stepped.changed || !stepped.next) return { committed: true, changed: false, attempt: stepped.next }
            if (!belongs(stepped.next, puzzleId)) return { committed: false, changed: false, attempt: read }
            if (!set(LOCAL_ATTEMPT_PREFIX + puzzleId, stepped.next)) return { committed: false, changed: false, attempt: read }
            notify(puzzleId)
            return { committed: true, changed: true, attempt: stepped.next }
        },
        legacyCheck: async scan => {
            const existing = readLegacy()
            if (existing) return { committed: true, legacy: existing }
            // One value under one key: the marks and the done flag are written together or
            // not at all. Two tabs running this together aren't coordinated (rule 13).
            const legacy: Legacy = { checked: true, marks: [...scan()] }
            return set(LOCAL_LEGACY_KEY, legacy) ? { committed: true, legacy } : { committed: false, legacy: null }
        },
        readLegacy: async () => readLegacy(),
        close: () => {},
    }
}

/** `localStorage`, or null when there isn't a usable one (see `progressStorage.ts`). */
const browserStorage = (): Storage | null => {
    try {
        if (typeof window === 'undefined') return null
        const candidate = window.localStorage
        return typeof candidate?.getItem === 'function' ? candidate : null
    } catch {
        return null
    }
}

/** An unsaved tab's records. Each instance is independent; it never broadcasts or writes. */
export const memoryAttemptStore = (): AttemptStore => {
    const attempts = new Map<string, Attempt>()
    let legacy: Legacy | null = null
    return {
        kind: 'memory',
        read: async id => attempts.get(id) ?? null,
        readAll: async () => [...attempts.values()],
        change: async (id, step) => {
            const current = attempts.get(id) ?? null
            try {
                const next = step(current)
                if (next.next && !belongs(next.next, id)) return { committed: false, changed: false, attempt: current }
                if (next.changed && next.next) attempts.set(id, next.next)
                return { committed: true, changed: next.changed, attempt: next.next }
            } catch {
                return { committed: false, changed: false, attempt: current }
            }
        },
        readLegacy: async () => legacy,
        legacyCheck: async scan => {
            try {
                legacy ??= { checked: true, marks: [...scan()] }
                return { committed: true, legacy }
            } catch { return { committed: false, legacy: null } }
        },
        close: () => {},
    }
}

/** A selected persistent backend that cannot reopen: failure, never a switch of backend. */
const unavailable = (kind: 'indexeddb'): AttemptStore => ({
    kind, read: async () => null, readAll: async () => null,
    change: async () => ({ committed: false, changed: false, attempt: null }),
    legacyCheck: async () => ({ committed: false, legacy: null }),
    readLegacy: async () => null, close: () => {},
})

export type OpeningOptions = {
    factory?: IDBFactory | null
    storage?: () => Storage | null
    /** Retain the choice through lifecycle restart; never reclassify a later failure. */
    kind?: AttemptStore['kind']
}

const probeToken = (): string => {
    try { return crypto.randomUUID() }
    catch { return `${Date.now()}.${Math.random()}` }
}

/** Capability is decided once at opening, separately from a later failed operation. */
export const openAttemptStore = async (options: OpeningOptions = {}): Promise<AttemptStore> => {
    if (options.kind === 'memory') return memoryAttemptStore()
    if (options.kind !== 'localStorage') {
        let indexed: AttemptStore | null = null
        try {
            const factory = options.factory === undefined ? globalThis.indexedDB : options.factory ?? undefined
            indexed = factory ? await openIndexedDbStore(factory) : null
        } catch { /* Access to the API itself may be blocked. */ }
        if (indexed) return indexed
        if (options.kind === 'indexeddb') return unavailable('indexeddb')
    }
    let storage: Storage | null = null
    try { storage = (options.storage ?? browserStorage)() } catch { /* Blocked getter. */ }
    if (options.kind === 'localStorage') return localStorageStore(storage)
    if (storage) {
        // A new key, with collision checking: no existing data is overwritten by the probe.
        let key: string | null = null
        let wrote = false
        try {
            key = `dominoFill.challenge.probe.${probeToken()}`
            if (storage.getItem(key) !== null) return memoryAttemptStore()
            storage.setItem(key, key)
            wrote = true
            if (storage.getItem(key) !== key) return memoryAttemptStore()
            storage.removeItem(key)
            wrote = false
            return localStorageStore(storage)
        } catch { /* Not usable at opening: explicitly unsaved for this tab. */ }
        finally {
            if (wrote && key !== null) { try { storage.removeItem(key) } catch { /* Removal also blocked. */ } }
        }
    }
    return memoryAttemptStore()
}
