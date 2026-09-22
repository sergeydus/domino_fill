import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

/**
 * Explicit server lifecycle for the browser tests.
 *
 * Playwright's managed `webServer` hung at "Terminating the WebServer" on Windows: it runs
 * the command through a shell, so killing that shell can leave the real `next start` alive
 * and teardown waits on a port that never frees. We own the lifecycle instead.
 *
 * Everything here is written on the assumption that teardown WILL fail somewhere, someday:
 * no failure is swallowed, every wait is bounded, and the child's own output is surfaced
 * when something goes wrong. A harness that other work depends on has to say why it failed.
 */

export const PORT = 3100
export const BASE_URL = `http://127.0.0.1:${PORT}`

const ROOT = path.resolve(__dirname, '..')
const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')

type ExitInfo = { code: number | null, signal: NodeJS.Signals | null }

type Managed = {
    child: ChildProcess
    /** Resolves when the child exits; never rejects. */
    exited: Promise<ExitInfo>
    hasExited: () => boolean
    output: () => string
}

const isPortFree = (port: number) => new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' })
    socket.setTimeout(500)
    const done = (free: boolean) => { socket.destroy(); resolve(free) }
    socket.once('connect', () => done(false))
    socket.once('timeout', () => done(true))
    socket.once('error', () => done(true))
})

const waitFor = async (predicate: () => Promise<boolean>, timeoutMs: number, label: string) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await predicate()) return true
        await new Promise(r => setTimeout(r, 250))
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`)
}

const responds = async () => {
    try {
        const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) })
        return res.status < 500
    } catch {
        return false
    }
}

/** Wait for the child to exit, or report that it did not within the budget. */
const awaitExit = (m: Managed, timeoutMs: number) => Promise.race([
    m.exited.then(() => true),
    new Promise<boolean>(r => setTimeout(() => r(false), timeoutMs)),
])

/** Non-throwing variant: returns whether the condition held within the budget. */
const settle = async (predicate: () => Promise<boolean>, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await predicate()) return true
        await new Promise(r => setTimeout(r, 250))
    }
    return false
}

/** Which pids currently hold the port, for diagnostics when something lingers. */
const portHolders = (): string[] => {
    try {
        const res = process.platform === 'win32'
            ? spawnSync('netstat', ['-ano'], { encoding: 'utf8' })
            : spawnSync('lsof', ['-ti', `tcp:${PORT}`], { encoding: 'utf8' })
        const lines = (res.stdout ?? '').split(/\r?\n/)
        if (process.platform !== 'win32') return lines.map(l => l.trim()).filter(Boolean)
        return [...new Set(lines
            .filter(l => new RegExp(`:${PORT}\\s`).test(l) && /LISTENING/i.test(l))
            .map(l => l.trim().split(/\s+/).pop()!)
            .filter(Boolean))]
    } catch {
        return []
    }
}

/** Kill the whole tree, surfacing any failure. */
const killTree = (pid: number) => {
    if (process.platform === 'win32') {
        const res = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { encoding: 'utf8' })
        if (res.error || res.status !== 0) {
            console.error(
                `[e2e] taskkill /pid ${pid} /T /F failed: status=${res.status} ` +
                `error=${res.error?.message ?? 'none'}\n` +
                `  stdout: ${(res.stdout ?? '').trim()}\n` +
                `  stderr: ${(res.stderr ?? '').trim()}`
            )
        }
    } else {
        try {
            process.kill(-pid, 'SIGKILL')
        } catch (err) {
            console.error(`[e2e] group kill of ${-pid} failed: ${(err as Error).message}`)
            try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
        }
    }
}

const describe = (m: Managed) => {
    const out = m.output().trim()
    return out ? `\n--- server output ---\n${out}\n---------------------` : ' (no output captured)'
}

const start = (): Managed => {
    const child = spawn(process.execPath, [NEXT_BIN, 'start', '--port', String(PORT)], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32', // own process group, for the group kill
        windowsHide: true,
    })

    let buffer = ''
    const collect = (chunk: Buffer) => { buffer += chunk.toString() }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)

    let done = false
    const exited = new Promise<ExitInfo>((resolve) => {
        child.once('exit', (code, signal) => { done = true; resolve({ code, signal }) })
        child.once('error', (err) => { done = true; buffer += `\nspawn error: ${err.message}`; resolve({ code: null, signal: null }) })
    })

    return { child, exited, hasExited: () => done, output: () => buffer }
}

const terminate = async (m: Managed) => {
    const pid = m.child.pid

    // Never signal a pid we no longer own: on Windows the number is recycled, and killing a
    // tree by a reused pid would take down an unrelated process.
    if (!m.hasExited() && pid) {
        m.child.kill()

        if (!await awaitExit(m, 5_000) && !m.hasExited()) {
            killTree(pid)
            if (!await awaitExit(m, 10_000)) {
                // The process outliving termination IS fatal: the next run cannot start.
                throw new Error(`Server process ${pid} did not exit after termination.${describe(m)}`)
            }
        }
    }

    // The process we owned is gone. If the port is STILL accepting connections, that is not
    // slow cleanup -- `isPortFree` connects, and a socket in TIME_WAIT refuses connections --
    // so something else is actively listening. That means an orphan we failed to kill, and
    // it must fail the run: leaving it alive would silently poison the next one.
    //
    // Note there is deliberately no tree-kill here. Escalation happens above, while we still
    // own the parent; signalling a pid after its process has exited is the reused-pid hazard
    // this function is written to avoid, and a dead parent cannot be walked for children.
    if (await settle(() => isPortFree(PORT), 20_000)) return

    throw new Error(
        `Server process ${pid} exited, but port ${PORT} is still accepting connections -- ` +
        `an orphaned listener survived teardown. Holder pid(s): ` +
        `${portHolders().join(', ') || 'unknown'}.${describe(m)}`
    )
}

export const startServer = async () => {
    if (!await isPortFree(PORT)) {
        throw new Error(
            `Port ${PORT} is already in use. The e2e suite starts its own production server ` +
            `and will not test an unknown one -- stop the other process and re-run.`
        )
    }

    // Build first, synchronously, with output surfaced on failure. `stdio: 'ignore'` here
    // turns a broken build into an unexplained timeout further down.
    /*
     * The build is told where the site lives (spec P2-2, row 20b).
     *
     * `metadataBase` decides the absolute URLs in the Open Graph tags, and when it is
     * unset Next falls back to `http://localhost:3000` with only a build *warning* -- so a
     * real deployment ships a preview image pointing at somebody's laptop. Nothing in a
     * test can see that while the test server is itself on localhost, which is exactly why
     * a mutation removing `metadataBase` survived the first version of this suite.
     * Building against `127.0.0.1:3100` makes the fallback and the real value differ, and
     * `e2e/metadata.spec.ts` then checks the tag against the origin it was served from.
     */
    const build = spawnSync(process.execPath, [NEXT_BIN, 'build'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, NEXT_PUBLIC_SITE_URL: BASE_URL },
    })
    if (build.status !== 0) {
        throw new Error(
            `next build failed (status ${build.status}).\n` +
            `${build.stdout ?? ''}\n${build.stderr ?? ''}`
        )
    }

    const m = start()

    // Race readiness against the child dying. Without this, a bind failure leaves us polling
    // the port until timeout -- and if anything else grabs it in the meantime, we would
    // happily run the whole suite against an unrelated server.
    const died = m.exited.then((info) => {
        throw new Error(
            `Server exited before becoming ready (code=${info.code}, signal=${info.signal}).` +
            describe(m)
        )
    })
    died.catch(() => { /* handled below; prevents an unhandled rejection if readiness wins */ })

    try {
        await Promise.race([
            waitFor(responds, 120_000, `${BASE_URL} to respond`),
            died,
        ])
    } catch (err) {
        await terminate(m).catch(e => console.error(`[e2e] cleanup after failed start: ${e.message}`))
        throw err
    }

    return async () => { await terminate(m) }
}
