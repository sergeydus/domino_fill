/**
 * Strict command-line parsing for the corpus scripts (spec P1-6, row 18c).
 *
 * Each script used to look its own options up with `process.argv.indexOf('--out')` and take
 * whatever sat next to it. That is permissive in three ways that all end the same place:
 *
 *   - `--out ""` passed every check, the build generated a full corpus, and only then died
 *     on `mkdir ''` — after the work, which is precisely the ordering the build script
 *     exists to avoid;
 *   - `--out --months 3` silently used the string `--months` as a directory name;
 *   - `--monts 3` matched nothing, so the typo quietly ran the default 120-month build.
 *
 * A command line is configuration, and wrong configuration should fail immediately and say
 * what was wrong, the same way an impossible generator request does.
 */

/** A command line that cannot be obeyed. Reported as a message, not a stack trace. */
export class ArgumentError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ArgumentError'
    }
}

const listOf = (allowed: readonly string[]) =>
    (allowed.length === 0
        ? 'no options'
        : `${allowed.map(name => `--${name}`).join(', ')}, each followed by a value`)

/**
 * Parse `--name value` pairs, rejecting anything that is not exactly that.
 *
 * Returns only the options actually given, so a caller can tell "not supplied" from
 * "supplied as something" and apply its own default.
 */
export const parseArgs = (
    argv: readonly string[],
    allowed: readonly string[],
): Record<string, string> => {
    const known = new Set(allowed)
    const options: Record<string, string> = {}

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i]
        if (!token.startsWith('--')) {
            throw new ArgumentError(
                `unexpected argument ${JSON.stringify(token)}. Expected ${listOf(allowed)}.`)
        }

        const name = token.slice(2)
        if (!known.has(name)) {
            throw new ArgumentError(`unknown option ${token}. Expected ${listOf(allowed)}.`)
        }
        if (name in options) {
            throw new ArgumentError(
                `${token} was given more than once, and only the first would have counted.`)
        }

        const value = argv[i + 1]
        if (value === undefined) {
            throw new ArgumentError(`${token} needs a value.`)
        }
        // An option where a value belongs is a missing value, not a directory called
        // "--months". Catching it here is the difference between a clear complaint and a
        // corpus written somewhere surprising.
        if (value.startsWith('--')) {
            throw new ArgumentError(`${token} needs a value, but is followed by ${value}.`)
        }
        if (value.trim() === '') {
            throw new ArgumentError(`${token} needs a value, got ${JSON.stringify(value)}.`)
        }

        options[name] = value
        i++
    }
    return options
}

/**
 * Run a script's `main`, reporting a bad command line as one line instead of a stack.
 *
 * A stack trace for `--monts` tells the reader about this file, which is not where their
 * mistake is.
 */
export const runCli = (main: () => Promise<void>): void => {
    main().catch((error: unknown) => {
        console.error(error instanceof ArgumentError ? error.message : error)
        process.exitCode = 1
    })
}
