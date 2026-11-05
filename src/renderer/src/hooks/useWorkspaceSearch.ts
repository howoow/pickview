import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../../../shared/types'

interface SearchState {
  indices: number[] | null
  total: number
  elapsedMs: number
  searching: boolean
}

interface WorkerResultMessage {
  type: 'results'
  requestId: number
  indices: number[]
  total: number
  elapsedMs: number
}

interface WorkerIndexedMessage {
  type: 'indexed'
  version: number
}

export function useWorkspaceSearch(workspace: Workspace | null, query: string): SearchState {
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)
  const versionRef = useRef(0)
  const [indexedVersion, setIndexedVersion] = useState(0)
  const [state, setState] = useState<SearchState>({
    indices: null,
    total: 0,
    elapsedMs: 0,
    searching: false
  })

  useEffect(() => {
    const worker = new Worker(new URL('../search.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResultMessage | WorkerIndexedMessage>) => {
      if (event.data.type === 'indexed') {
        setIndexedVersion(event.data.version)
        return
      }
      if (event.data.requestId !== requestRef.current) return
      setState({
        indices: event.data.indices,
        total: event.data.total,
        elapsedMs: event.data.elapsedMs,
        searching: false
      })
    }
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    const version = ++versionRef.current
    setIndexedVersion(0)
    worker.postMessage({
      type: 'index',
      version,
      items: (workspace?.images ?? []).map((image) => ({
        name: image.name,
        relativePath: image.relativePath
      }))
    })
  }, [workspace])

  useEffect(() => {
    const normalizedQuery = query.trim()
    if (!workspace || !normalizedQuery) {
      requestRef.current += 1
      setState({ indices: null, total: 0, elapsedMs: 0, searching: false })
      return
    }
    if (indexedVersion !== versionRef.current) return

    const worker = workerRef.current
    if (!worker) return

    const requestId = ++requestRef.current
    setState((current) => ({ ...current, searching: true }))
    const timer = window.setTimeout(() => {
      worker.postMessage({ type: 'search', requestId, query: normalizedQuery })
    }, 45)
    return () => window.clearTimeout(timer)
  }, [indexedVersion, query, workspace])

  return state
}
