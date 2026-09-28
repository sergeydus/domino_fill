import { startServer } from './server'

/**
 * Playwright runs the returned function as global teardown, so the server's lifetime is
 * bounded by this module rather than by Playwright's webServer manager.
 */
export default async function globalSetup() {
    const stop = await startServer()
    return async () => { await stop() }
}
