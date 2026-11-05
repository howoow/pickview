import { useEffect, useState } from 'react'

export function usePersistedState<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored === null ? initialValue : (JSON.parse(stored) as T)
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Persistence is best-effort when the renderer is under storage pressure.
    }
  }, [key, value])

  return [value, setValue]
}
