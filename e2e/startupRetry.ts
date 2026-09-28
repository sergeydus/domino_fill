/**
 * Whether a failed page startup earns one automatic reload — decided in one pure place.
 *
 * This exists because the first version of the rule was broader than the claim it printed.
 * It matched three error codes, accepted a failure on *any* resource, and then announced
 * "the machine ran out of sockets, not the app". Only one of those codes was ever measured,
 * only a bootstrap request can actually prevent startup, and a failed sound effect proves
 * nothing about either. A harness that retries on a rule looser than its own explanation is
 * a harness that will one day retry past a real defect and say it was the network.
 *
 * So the rule is narrow and the vocabulary is honest:
 *
 * - `ERR_NO_BUFFER_SPACE` is the **measured** diagnosis. One full run leaves ~2500 sockets
 *   to the test port in `TIME_WAIT`; under that pressure Chromium fails a request at the
 *   transport layer with exactly this code. That is the failure that was captured, so it
 *   is the only one named as socket exhaustion.
 * - `ERR_INSUFFICIENT_RESOURCES` and `ERR_NETWORK_CHANGED` are transient browser/network
 *   resource failures. They are retried on the same reasoning but **not** diagnosed: no
 *   cause is claimed for them, because none was measured.
 *
 * And a retry needs all of:
 *
 * - a *critical* request to have failed — the document itself, or a `/_next/static/chunks`
 *   script. Nothing else can stop the page booting.
 * - `hydrated === false`. If React got control, the bundle arrived; whatever went wrong
 *   after that is the app's business and must be reported, not re-rolled.
 * - no reload used yet. One, or a genuinely broken page loops until the timeout.
 */

/**
 * Chromium's classification of what a request was for.
 *
 * Recorded rather than inferred from the URL. An earlier version decided "document" meant
 * "path with no file extension", which quietly swept in every Server Action POST to `/` and
 * every extensionless `/api/...` call — requests that cannot stop the page booting and must
 * never authorise a retry.
 */
export type ResourceType = 'document' | 'script' | 'stylesheet' | 'image' | 'media' | 'fetch' | 'xhr' | 'font' | 'other'

/** One request-level failure, as observed by the test process. */
export type NetworkFailure = {
    url: string
    method: string
    resourceType: ResourceType
    /**
     * Which load attempt this belongs to: 0 before any reload, 1 after one.
     *
     * For the *report* only. The decision never filters on it, because a decision is only
     * ever taken while `reloadsUsed` is 0 -- any later call returns at the first guard. It
     * exists so the final diagnostics can show both attempts' failures without the reader
     * having to guess which load each belongs to.
     */
    attempt: number
} & (
        /** The request never completed: a transport-level error, with Chromium's code. */
        | { kind: 'failed', error: string }
        /** The request completed with an error status: the server answered, so the app is at fault. */
        | { kind: 'http', status: number }
    )

export type RetryDecision = {
    retry: boolean
    /** The measured diagnosis, or null when the cause is not established. */
    diagnosis: 'socket-exhaustion' | null
    /** One line, suitable for the console, phrased to match what is actually known. */
    reason: string
}

/** The only code whose cause has been measured. */
const MEASURED_EXHAUSTION = 'ERR_NO_BUFFER_SPACE'

/** Transient transport failures retried without claiming to know why they happened. */
const TRANSIENT = ['ERR_INSUFFICIENT_RESOURCES', 'ERR_NETWORK_CHANGED']

/**
 * Requests without which the page cannot boot.
 *
 * The navigation itself, and the JS chunks that carry the app. A failed image, sound,
 * stylesheet or API call leaves the page perfectly able to hydrate, so a startup that
 * failed alongside one of those failed for some other reason.
 *
 * Method is not consulted because `resourceType` already settles it: a Server Action POST
 * to `/` is `fetch`, not `document`, however much its URL looks like the page's.
 */
export const isCriticalRequest = (
    request: { url: string, resourceType: ResourceType },
) => {
    if (request.resourceType === 'document') return true
    if (request.resourceType !== 'script') return false
    try {
        const { pathname } = new URL(request.url, 'http://placeholder')
        return /^\/_next\/static\/chunks\/.+\.js$/.test(pathname)
    } catch {
        return false
    }
}

const codeOf = (failure: NetworkFailure) => failure.kind === 'failed' ? failure.error : ''

/**
 * Decide whether to reload once after a startup that never produced a board.
 *
 * Pure: everything it needs is in the arguments, so the rule can be tested without a
 * browser — which is the point, since the condition it guards against appears roughly once
 * in twelve full runs and cannot be summoned on demand.
 *
 * Failures are kept across a reload so the final diagnostics can show both attempts, but
 * this function does not filter on `attempt`: the `reloadsUsed` guard above means a
 * decision is only ever taken on the first load, so such a filter would be code that reads
 * as load-bearing while having no effect. A mutation test caught exactly that.
 */
export const shouldRetryStartup = (state: {
    failures: readonly NetworkFailure[]
    hydrated: boolean
    reloadsUsed: number
}): RetryDecision => {
    if (state.reloadsUsed > 0) {
        return { retry: false, diagnosis: null, reason: 'a reload was already used; reporting the failure' }
    }
    if (state.hydrated) {
        return {
            retry: false,
            diagnosis: null,
            reason: 'the page hydrated, so the bundle arrived; this is not a load failure',
        }
    }

    const critical = state.failures.filter(f => f.kind === 'failed' && isCriticalRequest(f))
    if (critical.length === 0) {
        return {
            retry: false,
            diagnosis: null,
            reason: 'no critical request failed at the transport layer',
        }
    }

    const exhausted = critical.filter(f => codeOf(f).includes(MEASURED_EXHAUSTION))
    if (exhausted.length > 0) {
        return {
            retry: true,
            diagnosis: 'socket-exhaustion',
            reason:
                `a bootstrap request failed with ${MEASURED_EXHAUSTION}, which on this machine ` +
                `means the socket pool is exhausted -- roughly 2500 sockets to the test port sit ` +
                `in TIME_WAIT after a full run. Not an application failure. Reloading once; if ` +
                `this is frequent, use fewer Playwright workers or pause between runs`,
        }
    }

    const transient = critical.filter(f => TRANSIENT.some(code => codeOf(f).includes(code)))
    if (transient.length > 0) {
        return {
            retry: true,
            diagnosis: null,
            reason:
                `a bootstrap request failed with a transient browser/network resource error ` +
                `(${transient.map(codeOf).join(', ')}). The cause is not established. Reloading once`,
        }
    }

    return {
        retry: false,
        diagnosis: null,
        reason: `a bootstrap request failed, but not with a retryable error (${critical.map(codeOf).join(', ')})`,
    }
}
