import { makeAutoObservable, observable, runInAction } from 'mobx'
import type { PuzzleSession } from '../stores/PuzzleSession'
import { definitionFrom } from '../stores/PuzzleDefinition'
import type { LoadedDay } from '../stores/corpusSource'
import {
    dayKey, isExpired, legacyEntries, LEGACY_KEY, migrateLegacy, progressFor,
    readAllProgress, readProgress, solveEvidenceFor, writeProgress, pruneStorage,
    type PuzzleProgress, type ProgressSolveEvidence,
} from '../stores/progressStorage'
import {
    finish, markAssisted, markClockError, recover, settle, start as startAttempt,
    type Attempt, type Step,
} from './attempt'
import {
    CHANNEL, legacyMarks, openAttemptStore, type AttemptStore, type Legacy, type Outcome,
} from './attemptStore'
import { elapsed, read, wentBack, type Reading } from './clock'
import { addDays, inWindow, isDay } from './window'

export type Snapshot = Omit<PuzzleProgress, 'savedAt'>
type PendingProgress = { generation: number, record: PuzzleProgress }
type PendingFinish = { solvedAt: number, solvedOn: string }
type Practice = { startedAt: number, ms?: number }

/** One explicit daily identity; never derive a date from the opaque puzzle ID. */
export class ChallengeBinding {
    attempt: Attempt | null = null
    ready = false
    error: 'identity' | 'save' | null = null
    clockErrorPending = false
    hydrating = false
    served = true
    busy = 0
    starting = false
    assisting = false
    pendingFinish: PendingFinish | null = null
    practice: Practice | null = null
    /** An untouched empty Start retry may adopt this attempt's newer cross-tab progress. */
    emptyStartRetry = false
    locallyEdited = false
    attemptStartedAt: number | undefined = undefined
    solveEvidence: ProgressSolveEvidence | undefined = undefined
    baseline: Snapshot
    pending: PendingProgress | null = null
    generation = 0

    constructor(readonly session: PuzzleSession, readonly date: string) {
        this.baseline = { definitionHash: session.definition.definitionHash, ...session.snapshot }
        makeAutoObservable(this, {
            session: false, baseline: false, pending: observable.ref,
            attempt: observable.ref, solveEvidence: observable.ref,
            pendingFinish: observable.ref, practice: observable.ref,
        })
    }

    get puzzleId() { return this.session.definition.puzzleId }
    get definition() { return this.session.definition }
    get finished() { return !!this.attempt?.result && this.attempt.result.kind !== 'given-up' }
    get progressSaveFailed() { return this.pending !== null }
    get metadata(): Pick<Snapshot, 'attemptStartedAt' | 'solveEvidence'> {
        return {
            ...(this.attemptStartedAt === undefined ? {} : { attemptStartedAt: this.attemptStartedAt }),
            ...(this.solveEvidence === undefined ? {} : { solveEvidence: this.solveEvidence }),
        }
    }
}

export type CoordinatorOptions = {
    openStore?: (kind?: AttemptStore['kind']) => Promise<AttemptStore>
    clock?: () => Reading
    loadDay: (date: string) => Promise<LoadedDay>
    progress?: (memory: boolean, now: number) => Record<string, PuzzleProgress>
    readProgress?: (id: string) => PuzzleProgress | null
    writeProgress?: (id: string, record: PuzzleProgress) => boolean
    listen?: (wake: () => void, notice: (id: string) => void, crossTab: boolean) => () => void
    schedule?: (tick: () => void) => () => void
    /** Reset only this hydrated session's persistence baseline. */
    hydrated?: (id: string) => void
    initialized?: () => void
}

const defaultProgress = (memory: boolean, now: number): Record<string, PuzzleProgress> => {
    let carried: Record<string, PuzzleProgress> = {}
    if (!memory) carried = migrateLegacy(now)
    else {
        // Unsaved mode may still read older casual records, but never migrates by writing.
        try {
            carried = legacyEntries(window.localStorage.getItem(LEGACY_KEY) ?? '') ?? {}
        } catch { /* Blocked. */ }
    }
    return { ...carried, ...readAllProgress() }
}

const browserListeners: NonNullable<CoordinatorOptions['listen']> = (wake, notice, crossTab) => {
    if (typeof window === 'undefined') return () => {}
    const visible = () => { if (document.visibilityState === 'visible') wake() }
    const storage = () => wake()
    window.addEventListener('focus', wake)
    if (crossTab) window.addEventListener('storage', storage)
    document.addEventListener('visibilitychange', visible)
    let channel: BroadcastChannel | null = null
    try {
        if (!crossTab) return () => {
            window.removeEventListener('focus', wake)
            document.removeEventListener('visibilitychange', visible)
        }
        channel = new BroadcastChannel(CHANNEL)
        channel.onmessage = ({ data }: MessageEvent<unknown>) => {
            if (typeof data !== 'object' || data === null) return
            const id = (data as { puzzleId?: unknown }).puzzleId
            if (typeof id === 'string') notice(id)
        }
    } catch { /* Focus still provides refresh where the channel is absent. */ }
    return () => {
        window.removeEventListener('focus', wake)
        window.removeEventListener('storage', storage)
        document.removeEventListener('visibilitychange', visible)
        channel?.close()
    }
}

/** Inactive unless owned by an explicitly enabled root; all effects begin at start(). */
export class ChallengeCoordinator {
    active = false
    status: 'idle' | 'loading' | 'ready' | 'retry' = 'idle'
    legacy: Legacy | null = null
    now: Reading
    readonly bindings = new Map<PuzzleSession, ChallengeBinding>()
    private store: AttemptStore | null = null
    private opening: Promise<AttemptStore> | null = null
    private selectedKind: AttemptStore['kind'] | undefined = undefined
    private memory: AttemptStore | null = null
    private epoch = 0
    private initializing: Promise<void> | null = null
    private refreshing: Promise<void> | null = null
    private disposeListeners: (() => void) | null = null
    private disposeTimer: (() => void) | null = null
    private lastDate: string | null = null
    private unfinished = new Map<string, Attempt>()
    private clockFlags = new Set<string>()
    private serial = new Map<string, Promise<unknown>>()
    private progressMemory = new Map<string, PuzzleProgress>()
    private hydrations = new Map<ChallengeBinding, Promise<void>>()
    private finishes = new Map<ChallengeBinding, Promise<void>>()

    constructor(private readonly options: CoordinatorOptions) {
        this.now = (options.clock ?? read)()
        makeAutoObservable<this, 'options' | 'store' | 'opening' | 'selectedKind' | 'memory' | 'epoch'
            | 'initializing' | 'refreshing' | 'disposeListeners' | 'disposeTimer' | 'lastDate'
            | 'unfinished' | 'clockFlags' | 'serial' | 'progressMemory' | 'hydrations' | 'finishes'>(this, {
            options: false, store: false, opening: false, selectedKind: observable.ref, memory: false,
            epoch: false, initializing: false, refreshing: false, disposeListeners: false,
            disposeTimer: false, lastDate: false, unfinished: false, clockFlags: false,
            serial: false, progressMemory: false, hydrations: false, finishes: false,
            bindings: observable.shallow, legacy: observable.ref,
        })
    }

    get unsaved() { return this.selectedKind === 'memory' }
    get deviceDate() { return dayKey(new Date(this.now.wall)) }
    isCovered(binding: ChallengeBinding): boolean {
        if (binding.date > this.deviceDate) return true
        if (binding.date < addDays(this.deviceDate, -1)) return false
        if (!binding.ready || this.status !== 'ready') return true
        if (binding.starting) return true
        return !this.legacy?.marks.includes(binding.puzzleId) && !binding.attempt
    }
    private currentDate() {
        return dayKey(new Date((this.options.clock ?? read)().wall))
    }
    isCasual(binding: ChallengeBinding, date = this.currentDate()): boolean {
        return binding.date < addDays(date, -1) || !!this.legacy?.marks.includes(binding.puzzleId)
    }
    canStart(binding: ChallengeBinding): boolean {
        return this.active && this.status === 'ready' && binding.ready && binding.served
            && !binding.starting && !binding.assisting && !binding.pendingFinish
            && binding.error !== 'identity' && inWindow(binding.date, this.currentDate())
            && !this.legacy?.marks.includes(binding.puzzleId)
    }
    canMutate(binding: ChallengeBinding): boolean {
        if (binding.starting || binding.assisting || binding.pendingFinish || !binding.served) return false
        const date = this.currentDate()
        if (binding.date > date || binding.error === 'identity') return false
        if (this.isCasual(binding, date)) return true
        return this.active && this.status === 'ready' && binding.ready && !!binding.attempt
    }
    needsAssistanceSave(binding: ChallengeBinding): boolean {
        return !this.isCasual(binding) && !binding.attempt?.result
    }
    practiceElapsed(binding: ChallengeBinding): number | null {
        if (!binding.practice || !inWindow(binding.date, this.deviceDate)) return null
        return binding.practice.ms ?? Math.max(0, elapsed(binding.practice.startedAt, this.now.wall))
    }
    elapsedFor(binding: ChallengeBinding): number | null {
        const attempt = binding.attempt
        if (!attempt || !inWindow(binding.date, this.deviceDate)) return null
        return attempt.result?.kind === 'solved' ? attempt.result.ms
            : attempt.result ? null : Math.max(0, elapsed(attempt.startedAt, this.now.wall))
    }

    bind(session: PuzzleSession, date: string): ChallengeBinding {
        if (!isDay(date)) throw new Error('Binding requires a real calendar date')
        const previous = this.bindings.get(session)
        if (previous && previous.date === date) {
            previous.served = true
            return previous
        }
        const binding = new ChallengeBinding(session, date)
        this.bindings.set(session, binding)
        if (this.status === 'ready' && this.active) {
            const epoch = this.epoch
            const task = this.hydrate(binding, epoch).catch(() => {
                if (this.alive(epoch)) runInAction(() => { binding.error = 'save' })
            })
            this.hydrations.set(binding, task)
            void task.finally(() => {
                if (this.hydrations.get(binding) === task) this.hydrations.delete(binding)
            })
        }
        return binding
    }
    async whenBound(sessions: readonly PuzzleSession[]) {
        await Promise.all(sessions.map(session => {
            const binding = this.bindings.get(session)
            return binding ? this.hydrations.get(binding) : undefined
        }))
    }
    retain(sessions: ReadonlySet<PuzzleSession>) {
        for (const binding of this.bindings.values()) {
            binding.served = sessions.has(binding.session)
            this.retire(binding)
        }
    }
    private retire(binding: ChallengeBinding) {
        if (!binding.served && !binding.pending && !binding.pendingFinish && !binding.starting
            && !binding.assisting && binding.busy === 0) {
            this.bindings.delete(binding.session)
        }
    }

    async start(): Promise<void> {
        if (this.active) return this.initializing ?? Promise.resolve()
        this.active = true
        this.epoch++
        this.now = (this.options.clock ?? read)()
        // Attach after selection; memory mode keeps only local wake checks.
        return this.retry()
    }
    dispose() {
        this.active = false
        this.epoch++
        this.disposeListeners?.()
        this.disposeListeners = null
        this.disposeTimer?.()
        this.disposeTimer = null
        this.store?.close()
        this.store = null
        this.initializing = null
        this.refreshing = null
        this.hydrations.clear()
        this.finishes.clear()
        this.status = 'idle'
        for (const binding of this.bindings.values()) {
            binding.ready = false
            binding.starting = false
            binding.assisting = false
        }
    }
    private alive(epoch: number) { return this.active && this.epoch === epoch }

    private async acquire(): Promise<AttemptStore> {
        if (this.store) return this.store
        if (this.memory) {
            this.store = this.memory
            return this.memory
        }
        if (!this.opening) {
            const open = this.options.openStore ?? (kind => openAttemptStore({ kind }))
            this.opening = open(this.selectedKind).then(store => {
                runInAction(() => { this.selectedKind ??= store.kind })
                if (store.kind === 'memory') this.memory = store
                if (this.active) this.store = store
                else store.close()
                return store
            }).finally(() => { this.opening = null })
        }
        return this.opening
    }

    async retry(): Promise<void> {
        if (!this.active) return
        if (this.status === 'ready') {
            await this.refresh()
            this.retryProgress()
            await this.retryFinishes()
            return
        }
        if (this.initializing) return this.initializing
        const epoch = this.epoch
        this.status = 'loading'
        const task = this.initialize(epoch).catch(() => {
            if (this.alive(epoch)) runInAction(() => { this.status = 'retry' })
        }).finally(() => {
            if (this.alive(epoch)) this.initializing = null
        })
        this.initializing = task
        return task
    }

    private async initialize(epoch: number) {
        const store = await this.acquire()
        if (!this.alive(epoch)) return
        this.retryProgress()
        this.attach(epoch)
        if (!this.unsaved) pruneStorage((this.options.clock ?? read)().wall)
        let legacy = await store.readLegacy()
        if (!this.alive(epoch)) return
        if (!legacy) {
            // Rebuild the requested window if midnight passes during the load.
            for (;;) {
                const date = dayKey(new Date((this.options.clock ?? read)().wall))
                const loaded = await Promise.all([
                    this.options.loadDay(date), this.options.loadDay(addDays(date, -1)),
                ])
                if (!this.alive(epoch)) return
                if (date !== dayKey(new Date((this.options.clock ?? read)().wall))) continue
                const definitions = loaded.flatMap((entry, index) => {
                    const requested = index === 0 ? date : addDays(date, -1)
                    if (entry.clamped) return []
                    if (entry.requested !== requested || entry.day.date !== requested) {
                        throw new Error('Wrong legacy date')
                    }
                    return [...entry.day.easyBoards, ...entry.day.mediumBoards, ...entry.day.hardBoards]
                        .map(definitionFrom)
                })
                const outcome = await store.legacyCheck(() => legacyMarks(definitions, this.liveProgress()))
                if (!this.alive(epoch)) return
                if (!outcome.committed || !outcome.legacy) throw new Error('Legacy save failed')
                legacy = outcome.legacy
                break
            }
        }
        runInAction(() => { this.legacy = legacy })
        await this.enumerate(epoch, store)
        if (!this.alive(epoch)) return
        for (const binding of this.bindings.values()) await this.hydrate(binding, epoch)
        if (!this.alive(epoch)) return
        runInAction(() => {
            this.now = (this.options.clock ?? read)()
            this.lastDate = this.deviceDate
            this.status = 'ready'
            this.options.initialized?.()
        })
        this.attach(epoch)
    }

    private liveProgress() {
        const now = (this.options.clock ?? read)().wall
        const records = { ...(this.options.progress ?? defaultProgress)(this.unsaved, now),
            ...(this.unsaved ? Object.fromEntries(this.progressMemory) : {}) }
        return Object.fromEntries(Object.entries(records).filter(([, p]) => !isExpired(p.savedAt, now)))
    }
    private evidence(attempt: Attempt | null) {
        if (!attempt) return null
        const progress = this.unsaved ? this.progressMemory.get(attempt.puzzleId)
            : (this.options.readProgress ?? readProgress)(attempt.puzzleId)
        return progress && !isExpired(progress.savedAt, (this.options.clock ?? read)().wall)
            ? solveEvidenceFor(progress, attempt) : null
    }
    /** This root's captured finish is still available; only older durable evidence is lost. */
    private reconcileLive(current: Attempt | null, date: string): Step {
        const owner = current && [...this.bindings.values()].find(binding =>
            binding.pendingFinish && this.matches(binding, current))
        const pending = owner?.pendingFinish
        const evidence = this.evidence(current)
        const recovered = recover(current, pending && evidence
            && evidence.solvedAt >= pending.solvedAt ? null : evidence)
        const finished = pending
            ? finish(recovered.next, pending.solvedAt, pending.solvedOn)
            : { next: recovered.next, changed: false }
        const settled = settle(finished.next, date)
        return { next: settled.next, changed: recovered.changed || finished.changed || settled.changed }
    }
    private savedFor(binding: ChallengeBinding): PuzzleProgress | null {
        const record = this.unsaved ? this.progressMemory.get(binding.puzzleId)
            : (this.options.readProgress ?? readProgress)(binding.puzzleId)
        if (!record || isExpired(record.savedAt, (this.options.clock ?? read)().wall)) return null
        return progressFor(record, binding.definition)
    }
    private restoreAttemptProgress(binding: ChallengeBinding, saved: PuzzleProgress | null) {
        binding.hydrating = true
        binding.session.restore(saved ?? {
            board: binding.definition.initialBoard.map(row => [...row]), completed: false,
        })
        // A restored winning board is already complete, not a new placement/celebration.
        if (binding.session.completedByRules) binding.session.setCompleted(true)
        binding.solveEvidence = saved?.solveEvidence
        binding.hydrating = false
    }
    private enqueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.serial.get(id) ?? Promise.resolve()
        const task = previous.catch(() => {}).then(operation)
        this.serial.set(id, task)
        void task.finally(() => { if (this.serial.get(id) === task) this.serial.delete(id) }).catch(() => {})
        return task
    }
    private async transact(
        id: string, step: (attempt: Attempt | null) => Step, epoch: number,
    ): Promise<Outcome> {
        return this.enqueue(id, async () => {
            if (!this.alive(epoch) || !this.store) return { committed: false, changed: false, attempt: null }
            const outcome = await this.store.change(id, current => {
                if (!this.alive(epoch)) return { next: current, changed: false }
                const flagged = this.clockFlags.has(id)
                    ? markClockError(current) : { next: current, changed: false }
                const next = step(flagged.next)
                return { next: next.next, changed: flagged.changed || next.changed }
            })
            if (this.alive(epoch)) runInAction(() => {
                if (outcome.committed) {
                    if (outcome.attempt?.clockError || outcome.attempt?.result) this.clockFlags.delete(id)
                    if (outcome.attempt && !outcome.attempt.result) this.unfinished.set(id, outcome.attempt)
                    else this.unfinished.delete(id)
                    for (const binding of this.bindings.values()) {
                        if (binding.puzzleId !== id) continue
                        this.adopt(binding, outcome.attempt)
                        binding.clockErrorPending = this.clockFlags.has(id)
                    }
                }
            })
            return outcome
        })
    }
    /** Shared serialized transaction boundary for commit 4's Start/assist/finish hooks. */
    async change(binding: ChallengeBinding, step: (attempt: Attempt | null) => Step): Promise<Outcome> {
        if (!this.active || this.status !== 'ready' || !this.bindings.has(binding.session)) {
            return { committed: false, changed: false, attempt: binding.attempt }
        }
        binding.busy++
        const epoch = this.epoch
        try {
            const outcome = await this.transact(binding.puzzleId, current => {
                if (current && !this.matches(binding, current)) return { next: current, changed: false }
                return step(current)
            }, epoch)
            if (this.alive(epoch)) runInAction(() => {
                binding.error = outcome.committed ? binding.error : 'save'
            })
            return outcome
        } finally {
            runInAction(() => {
                binding.busy--
                this.retire(binding)
            })
        }
    }
    /** Explicit press only: the saved attempt precedes both empty progress and reveal. */
    async startBoard(binding: ChallengeBinding): Promise<boolean> {
        if (!this.canStart(binding)) return false
        const epoch = this.epoch
        const press = this.sample()
        const date = dayKey(new Date(press.wall))
        const previousStart = binding.attempt?.startedAt
        binding.starting = true
        try {
            let outcome = await this.change(binding, current => {
                const prior = this.reconcileLive(current, date)
                const started = startAttempt(prior.next, {
                    puzzleId: binding.puzzleId,
                    definitionHash: binding.definition.definitionHash,
                    date: binding.date,
                }, press.wall, date)
                return { next: started.next, changed: prior.changed || started.changed }
            })
            if (!this.alive(epoch) || !outcome.committed || !outcome.attempt
                || !this.matches(binding, outcome.attempt)) return false
            const liveDate = this.currentDate()
            const saved = this.savedFor(binding)
            const foundSolve = saved?.attemptStartedAt === outcome.attempt.startedAt
                && !!saved?.solveEvidence && !outcome.attempt.result
            if (!inWindow(binding.date, liveDate) || foundSolve) {
                outcome = await this.change(binding, current => this.reconcileLive(current, liveDate))
                if (!this.alive(epoch) || !outcome.committed) return false
            }
            runInAction(() => {
                this.now = (this.options.clock ?? read)()
                if (previousStart !== outcome.attempt!.startedAt || !binding.locallyEdited) {
                    const saved = this.savedFor(binding)
                    const matching = saved?.attemptStartedAt === outcome.attempt!.startedAt ? saved : null
                    this.restoreAttemptProgress(binding, matching)
                    binding.practice = null
                    binding.locallyEdited = false
                    binding.emptyStartRetry = matching === null
                }
                binding.starting = false
                this.captureProgress(binding, this.snapshot(binding))
                if (!binding.pending) binding.emptyStartRetry = false
            })
            return true
        } catch {
            if (this.alive(epoch)) runInAction(() => { binding.error = 'save' })
            return false
        } finally {
            if (this.alive(epoch)) runInAction(() => { binding.starting = false })
            this.retire(binding)
        }
    }
    /** Freeze the board until the assistance flag commits, then check its current owner. */
    async assist<T>(
        binding: ChallengeBinding, publish: () => T, stillSelected: () => boolean,
    ): Promise<T | null> {
        if (!this.canMutate(binding) || !this.needsAssistanceSave(binding)) return null
        const epoch = this.epoch
        binding.assisting = true
        this.sample()
        try {
            const outcome = await this.change(binding, current => {
                const prior = this.reconcileLive(current, this.currentDate())
                const assisted = inWindow(binding.date, this.currentDate())
                    ? markAssisted(prior.next) : { next: prior.next, changed: false }
                return { next: assisted.next, changed: prior.changed || assisted.changed }
            })
            if (!this.alive(epoch) || !outcome.committed || !outcome.attempt
                || !this.matches(binding, outcome.attempt) || !outcome.attempt.assisted
                || outcome.attempt.result || !inWindow(binding.date, this.currentDate())
                || !binding.served || !stillSelected()) return null
            return runInAction(publish)
        } catch {
            if (this.alive(epoch)) runInAction(() => { binding.error = 'save' })
            return null
        } finally {
            if (this.alive(epoch)) runInAction(() => { binding.assisting = false })
            this.retire(binding)
        }
    }
    /** Called synchronously inside a successful session mutation, never from a reaction. */
    boardChanged(binding: ChallengeBinding, placement: boolean) {
        const reading = this.sample()
        const date = dayKey(new Date(reading.wall))
        if (!binding.session.completedByRules) binding.session.setCompleted(false)
        binding.locallyEdited = true
        binding.emptyStartRetry = false
        if (this.isCasual(binding, date)) {
            binding.practice = null
            binding.solveEvidence = undefined
            return
        }
        const attempt = binding.attempt
        if (!attempt || !inWindow(binding.date, date)) return
        if (attempt.result) {
            binding.solveEvidence = undefined
            const previous = binding.practice
            const startedAt = !previous || previous.ms !== undefined ? reading.wall : previous.startedAt
            binding.practice = binding.session.completedByRules
                ? { startedAt, ms: Math.max(0, elapsed(startedAt, reading.wall)) } : { startedAt }
            return
        }
        if (!binding.session.completedByRules) binding.solveEvidence = undefined
        if (!placement || !binding.session.completedByRules) return
        binding.pendingFinish = { solvedAt: reading.wall, solvedOn: date }
        binding.solveEvidence = {
            ...binding.pendingFinish,
            columnTargets: binding.definition.columnTargets,
            rowTargets: binding.definition.rowTargets,
        }
        // Same setItem as the winning board, before any finish transaction is awaited.
        this.captureProgress(binding, this.snapshot(binding))
        void this.saveFinish(binding)
    }
    private snapshot(binding: ChallengeBinding): Snapshot {
        return { definitionHash: binding.definition.definitionHash,
            ...binding.session.snapshot, ...binding.metadata }
    }
    private saveFinish(binding: ChallengeBinding): Promise<void> {
        const existing = this.finishes.get(binding)
        if (existing) return existing
        if (!binding.pendingFinish || !this.active || this.status !== 'ready') return Promise.resolve()
        const epoch = this.epoch
        const task = this.change(binding, current => this.reconcileLive(current, this.currentDate()))
            .then(() => {})
            .catch(() => {
                if (this.alive(epoch)) runInAction(() => { binding.error = 'save' })
            }).finally(() => {
                if (this.finishes.get(binding) === task) this.finishes.delete(binding)
                this.retire(binding)
            })
        this.finishes.set(binding, task)
        return task
    }
    private async retryFinishes() {
        await Promise.all([...this.bindings.values()].filter(binding => binding.pendingFinish)
            .map(binding => this.saveFinish(binding)))
    }
    private matches(binding: ChallengeBinding, attempt: Attempt) {
        return attempt.puzzleId === binding.puzzleId
            && attempt.definitionHash === binding.definition.definitionHash
            && attempt.date === binding.date
    }
    private adopt(binding: ChallengeBinding, attempt: Attempt | null) {
        if (attempt && !this.matches(binding, attempt)) {
            binding.error = 'identity'
            binding.ready = false
            return
        }
        binding.attempt = attempt
        binding.attemptStartedAt = attempt?.startedAt
        if (attempt?.result) binding.pendingFinish = null
        binding.error = null
    }
    private async hydrate(binding: ChallengeBinding, epoch: number) {
        binding.busy++
        try {
            const outcome = await this.transact(binding.puzzleId,
                current => this.reconcileLive(current, this.currentDate()), epoch)
            if (!this.alive(epoch) || !outcome.committed || binding.error === 'identity') {
                if (this.alive(epoch) && !outcome.committed) throw new Error('Opening reconciliation failed')
                return
            }
            const saved = progressFor(binding.pending?.record ?? this.liveProgress()[binding.puzzleId],
                binding.definition)
            runInAction(() => {
                binding.hydrating = true
                const attempt = binding.attempt
                const restore = attempt
                    ? saved && saved.attemptStartedAt === attempt.startedAt ? saved : null : saved
                if (restore) this.restoreAttemptProgress(binding, restore)
                else if (attempt) this.restoreAttemptProgress(binding, null)
                binding.solveEvidence = restore?.solveEvidence
                binding.practice = null
                binding.baseline = this.snapshot(binding)
                binding.ready = true
                this.options.hydrated?.(binding.puzzleId)
                binding.hydrating = false
            })
        } finally {
            runInAction(() => {
                binding.busy--
                this.retire(binding)
            })
        }
    }
    private async enumerate(epoch: number, store: AttemptStore) {
        const all = await store.readAll()
        if (!this.alive(epoch)) return
        if (all === null) throw new Error('History read failed')
        for (const attempt of all) {
            if (!this.alive(epoch)) return
            if (!attempt.result) {
                const outcome = await this.transact(attempt.puzzleId,
                    current => this.reconcileLive(current, this.currentDate()), epoch)
                if (!outcome.committed) throw new Error('History reconciliation failed')
            }
        }
    }
    async refresh(): Promise<void> {
        if (!this.active || this.status !== 'ready') return
        if (this.refreshing) return this.refreshing
        const epoch = this.epoch
        const task = (async () => {
            await this.enumerate(epoch, this.store!)
            for (const binding of this.bindings.values()) {
                if (!this.alive(epoch)) return
                if (!binding.ready && binding.error !== 'identity') {
                    await this.hydrate(binding, epoch)
                    continue
                }
                const outcome = await this.transact(binding.puzzleId,
                    current => this.reconcileLive(current, this.currentDate()), epoch)
                if (!outcome.committed) runInAction(() => { binding.error = 'save' })
            }
            if (this.alive(epoch)) this.lastDate = dayKey(new Date((this.options.clock ?? read)().wall))
        })().catch(() => {
            if (this.alive(epoch)) runInAction(() => {
                for (const binding of this.bindings.values()) binding.error = 'save'
            })
        }).finally(() => { if (this.alive(epoch)) this.refreshing = null })
        this.refreshing = task
        await task
    }
    private attach(epoch: number) {
        if (!this.alive(epoch)) return
        const wake = () => {
            if (!this.alive(epoch)) return
            void this.refresh()
            this.tick()
        }
        if (!this.disposeListeners) {
            this.disposeListeners = (this.options.listen ?? browserListeners)(wake, id => {
                if (this.alive(epoch) && this.store) void this.transact(id,
                    current => this.reconcileLive(current, this.currentDate()), epoch).catch(() => {})
            }, !this.unsaved)
        }
        if (!this.disposeTimer) this.disposeTimer = (this.options.schedule ?? (tick => {
            const timer = setInterval(tick, 1000)
            return () => clearInterval(timer)
        }))(() => { if (this.alive(epoch)) this.tick() })
    }
    private sample(): Reading {
        const next = (this.options.clock ?? read)()
        if (wentBack(this.now, next)) for (const attempt of this.unfinished.values()) {
            this.clockFlags.add(attempt.puzzleId)
            for (const binding of this.bindings.values()) {
                if (binding.puzzleId === attempt.puzzleId) binding.clockErrorPending = true
            }
        }
        this.now = next
        const date = dayKey(new Date(next.wall))
        for (const binding of this.bindings.values()) {
            if (binding.practice && !inWindow(binding.date, date)) binding.practice = null
        }
        return next
    }
    tick() {
        if (!this.active) return
        this.sample()
        if (this.status !== 'ready') {
            void this.retry()
            return
        }
        const needsHydration = [...this.bindings.values()].some(binding =>
            !binding.ready && binding.error === 'save')
        if (this.deviceDate !== this.lastDate || needsHydration) void this.refresh()
        else for (const id of this.clockFlags) {
            if (!this.serial.has(id)) void this.transact(id,
                current => this.reconcileLive(current, this.deviceDate), this.epoch).catch(() => {})
        }
        this.retryProgress()
        void this.retryFinishes()
    }

    /** Only daily bindings in enabled roots use this path; casual persistence is unchanged. */
    captureProgress(binding: ChallengeBinding, snapshot: Snapshot) {
        if (binding.hydrating || binding.starting || !this.active) return
        if (!binding.ready && (!binding.locallyEdited || !this.isCasual(binding))) return
        if (JSON.stringify(binding.baseline) === JSON.stringify(snapshot)) return
        binding.baseline = snapshot
        binding.pending = {
            generation: ++binding.generation,
            record: { ...snapshot, savedAt: (this.options.clock ?? read)().wall },
        }
        this.flushProgress(binding)
        void this.retryFinishes()
    }
    private flushProgress(binding: ChallengeBinding) {
        const pending = binding.pending
        if (!pending || !this.active || this.selectedKind === undefined) return
        if (binding.emptyStartRetry && !binding.locallyEdited && binding.attempt) {
            const saved = this.savedFor(binding)
            if (saved?.attemptStartedAt === binding.attempt.startedAt) {
                this.restoreAttemptProgress(binding, saved)
                binding.pending = null
                binding.emptyStartRetry = false
                binding.baseline = this.snapshot(binding)
                this.options.hydrated?.(binding.puzzleId)
                this.retire(binding)
                return
            }
        }
        const saved = this.unsaved ? (this.progressMemory.set(binding.puzzleId, pending.record), true)
            : (this.options.writeProgress ?? writeProgress)(binding.puzzleId, pending.record)
        if (saved && binding.pending?.generation === pending.generation) {
            binding.pending = null
            binding.emptyStartRetry = false
        }
        this.retire(binding)
    }
    retryProgress() { for (const binding of this.bindings.values()) this.flushProgress(binding) }
}
