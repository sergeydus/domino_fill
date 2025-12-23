import { useState } from "react";

export const useLocalhost = <T>(key: string, initialValue: T) => {
    const currentItemString = localStorage.getItem(key)
    const [value, setValue] = useState<T>(currentItemString ? JSON.parse(currentItemString) as T : initialValue);
    const setLocalhost = (value: T) => {
        localStorage.setItem(key, JSON.stringify(value));
        setValue(value);
    }

    return [value, setLocalhost] as const;
};
