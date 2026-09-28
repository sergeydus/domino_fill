import { useCallback, useEffect, useState } from "react";

/**
 * Server-safe, exception-safe localStorage-backed state.
 *
 * Reading storage during render is not safe here: it breaks SSR, and on Node >= 22
 * `typeof localStorage !== 'undefined'` is true while `getItem` is not a function, so
 * guarding on the global's existence does not help. The only reliable guard is to touch
 * storage exclusively from an effect, which never runs on the server.
 *
 * Storage can also throw or be absent at runtime (Safari private mode, blocked site data,
 * embedded webviews), so every access is wrapped and falls back to `initialValue`.
 */
const readStorage = <T,>(key: string, initialValue: T): T => {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return initialValue;
        return JSON.parse(raw) as T;
    } catch {
        // Absent, blocked, or malformed JSON: fall back rather than throw.
        return initialValue;
    }
};

export const useLocalStorage = <T,>(key: string, initialValue: T) => {
    // Always start from `initialValue` so the server render and the first client render
    // agree; the stored value is applied in the effect below.
    const [value, setValue] = useState<T>(initialValue);

    useEffect(() => {
        setValue(readStorage(key, initialValue));
        // `initialValue` is intentionally not a dependency: re-running on a new object
        // identity would clobber the hydrated value on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const setStoredValue = useCallback((next: T) => {
        setValue(next);
        try {
            window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
            // Quota exceeded or storage blocked: keep the in-memory value.
        }
    }, [key]);

    return [value, setStoredValue] as const;
};
