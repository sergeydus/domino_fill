import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

/**
 * Explicit server lifecycle for the browser tests.
 *
 * Playwright's managed `webServer` was reported hanging at "Terminating the WebServer" on
 * Windows/Node 25: it launches the command through a shell, and killing that shell can
 * leave the actual `next start` process alive, so teardown waits forever on a port that
 * never frees. It is not reproducible everywhere, which is precisely why it should not be
 * load-bearing -- rows that follow depend on this harness terminating.
 *
 * So we own the lifecycle instead:
 *  - spawn Node directly on Next's bin, with no shell and no npx layer, so the process tree
 *    is one level deep and we hold the real pid;
 *  - refuse to start if the port is occupied, rather than silently testing whatever happens
 *    to be listening;
 *  - tear down with `taskkill /T /F` on Windows and a process-group kill elsewhere, then
 *    wait for the port to actually free before returning.
 */

export const PORT = 3100
export const BASE_URL = `http://127.0.0.1:${PORT}`

const ROOT = path.resolve(__dirname, '..')
const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')

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
        if (await predicate()) return
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

/** Kill the whole tree and wait for the port to free, so a later run starts clean. */
const killTree = async (child: ChildProcess) => {
    const pid = child.pid
    if (!pid) return

    if (process.platform === 'win32') {
        try {
            execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
        } catch {
            // Already gone.
        }
    } else {
        try { process.kill(-pid, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { } }
    }

    await waitFor(() => isPortFree(PORT), 15_000, `port ${PORT} to free`)
}

export const startServer = async () => {
    if (!await isPortFree(PORT)) {
        throw new Error(
            `Port ${PORT} is already in use. The e2e suite starts its own production server ` +
            `and will not test an unknown one -- stop the other process and re-run.`
        )
    }

    // Build first, synchronously. Chaining this into the server command is what created the
    // nested shell that teardown then could not reliably kill.
    execFileSync(process.execPath, [NEXT_BIN, 'build'], { cwd: ROOT, stdio: 'ignore' })

    const child = spawn(process.execPath, [NEXT_BIN, 'start', '--port', String(PORT)], {
        cwd: ROOT,
        stdio: 'ignore',
        detached: process.platform !== 'win32', // own process group, for the group kill
        windowsHide: true,
    })

    child.on('error', (err) => { throw err })

    try {
        await waitFor(responds, 120_000, `${BASE_URL} to respond`)
    } catch (err) {
        await killTree(child)
        throw err
    }

    return async () => { await killTree(child) }
}
