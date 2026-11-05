interface SearchIndexItem {
  name: string
  relativePath: string
}

interface IndexMessage {
  type: 'index'
  version: number
  items: SearchIndexItem[]
}

interface SearchMessage {
  type: 'search'
  requestId: number
  query: string
}

type IncomingMessage = IndexMessage | SearchMessage

interface WorkerScope {
  onmessage: ((event: MessageEvent<IncomingMessage>) => void) | null
  postMessage: (message: unknown) => void
}

const scope = self as unknown as WorkerScope
let index: SearchIndexItem[] = []
let indexedVersion = 0

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}

function scoreText(haystack: string, needle: string): number | null {
  const directIndex = haystack.indexOf(needle)
  if (directIndex >= 0) {
    const boundary = directIndex === 0 || /[\s/_\-.()[\]{}]/.test(haystack[directIndex - 1])
    return 1200 + (boundary ? 160 : 0) - directIndex * 2 - (haystack.length - needle.length) * 0.15
  }

  let queryIndex = 0
  let firstMatch = -1
  let previousMatch = -2
  let score = 0

  for (let index = 0; index < haystack.length && queryIndex < needle.length; index += 1) {
    if (haystack[index] !== needle[queryIndex]) continue
    if (firstMatch === -1) firstMatch = index
    if (index === previousMatch + 1) score += 14
    if (index === 0 || /[\s/_\-.()[\]{}]/.test(haystack[index - 1])) score += 9
    previousMatch = index
    queryIndex += 1
  }

  if (queryIndex !== needle.length) return null
  return score - firstMatch * 0.9 - (previousMatch - firstMatch) * 0.08 - haystack.length * 0.02
}

function findMatches(query: string): Array<{ index: number; score: number }> {
  const needle = normalize(query)
  if (!needle) return []

  const matches: Array<{ index: number; score: number }> = []
  for (let position = 0; position < index.length; position += 1) {
    const item = index[position]
    const nameScore = scoreText(item.name, needle)
    const pathScore = nameScore === null ? scoreText(item.relativePath, needle) : null
    const score = nameScore ?? (pathScore === null ? null : pathScore * 0.72)
    if (score !== null) matches.push({ index: position, score })
  }

  matches.sort((a, b) => b.score - a.score)
  return matches
}

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'index') {
    index = message.items.map((item) => ({
      ...item,
      name: normalize(item.name),
      relativePath: normalize(item.relativePath)
    }))
    indexedVersion = message.version
    scope.postMessage({ type: 'indexed', version: message.version })
    return
  }

  const startedAt = performance.now()
  const matches = findMatches(message.query)
  scope.postMessage({
    type: 'results',
    requestId: message.requestId,
    version: indexedVersion,
    indices: matches.slice(0, 1200).map((match) => match.index),
    total: matches.length,
    elapsedMs: performance.now() - startedAt
  })
}
