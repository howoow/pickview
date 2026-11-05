import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, net, shell } from 'electron'
import type { UpdateCheckResult } from '../shared/types'

const DEFAULT_REPOSITORY = 'howoow/pickview'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 9_000

const repository = (process.env.PICKVIEW_UPDATE_REPO ?? DEFAULT_REPOSITORY).trim()

interface ReleaseSummary {
  version: string
  name: string
  htmlUrl: string
  downloadUrl: string | null
  downloadName: string | null
  publishedAt: string | null
}

interface UpdateCache {
  repository: string
  lastAttemptAt: number
  lastSuccess: ReleaseSummary | null
}

interface GitHubReleaseResponse {
  tag_name?: unknown
  name?: unknown
  html_url?: unknown
  published_at?: unknown
  assets?: Array<{ name?: unknown; browser_download_url?: unknown }>
}

function cachePath(): string {
  return join(app.getPath('userData'), 'update-cache.json')
}

async function readCache(): Promise<UpdateCache | null> {
  try {
    const raw = await fs.readFile(cachePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<UpdateCache>
    if (parsed.repository !== repository || typeof parsed.lastAttemptAt !== 'number') return null
    return {
      repository,
      lastAttemptAt: parsed.lastAttemptAt,
      lastSuccess: parsed.lastSuccess ?? null
    }
  } catch {
    return null
  }
}

async function writeCache(cache: UpdateCache): Promise<void> {
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(cachePath(), JSON.stringify(cache), 'utf8')
  } catch {
    // The cache is a convenience only; a failed write must never affect browsing.
  }
}

function parseVersion(version: string): { parts: number[]; prerelease: string } {
  const clean = version.trim().replace(/^v/i, '')
  const [core, prerelease = ''] = clean.split('-', 2)
  const parts = core.split('.').map((part) => Number.parseInt(part, 10) || 0)
  while (parts.length < 3) parts.push(0)
  return { parts, prerelease }
}

function isNewerVersion(latest: string, current: string): boolean {
  const next = parseVersion(latest)
  const installed = parseVersion(current)
  for (let index = 0; index < Math.max(next.parts.length, installed.parts.length); index += 1) {
    const difference = (next.parts[index] ?? 0) - (installed.parts[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  if (next.prerelease === installed.prerelease) return false
  if (!next.prerelease) return true
  if (!installed.prerelease) return false
  return next.prerelease.localeCompare(installed.prerelease, undefined, { numeric: true }) > 0
}

function pickDownloadAsset(assets: GitHubReleaseResponse['assets']): {
  url: string | null
  name: string | null
} {
  const candidates = (assets ?? [])
    .map((asset) => ({
      name: typeof asset.name === 'string' ? asset.name : '',
      url: typeof asset.browser_download_url === 'string' ? asset.browser_download_url : ''
    }))
    .filter((asset) => asset.name && asset.url)

  if (candidates.length === 0) return { url: null, name: null }

  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : ''
  const rules =
    process.platform === 'darwin'
      ? [
          new RegExp(`mac-${arch}\\.dmg$`, 'i'),
          new RegExp(`mac-${arch}\\.zip$`, 'i'),
          /mac-arm64\.dmg$/i,
          /mac-x64\.dmg$/i,
          /\.dmg$/i
        ]
      : process.platform === 'win32'
        ? [
            new RegExp(`win-${arch}\\.exe$`, 'i'),
            /win-x64\.exe$/i,
            /\.exe$/i
          ]
        : []

  for (const rule of rules) {
    const match = candidates.find((asset) => rule.test(asset.name))
    if (match) return { url: match.url, name: match.name }
  }
  return { url: null, name: null }
}

function releaseSummary(payload: GitHubReleaseResponse): ReleaseSummary {
  const tag = typeof payload.tag_name === 'string' ? payload.tag_name : ''
  const version = tag.replace(/^v/i, '').trim() || tag
  const asset = pickDownloadAsset(payload.assets)
  const htmlUrl = typeof payload.html_url === 'string' ? payload.html_url : ''
  return {
    version,
    name: typeof payload.name === 'string' && payload.name ? payload.name : `捡影 v${version}`,
    htmlUrl,
    downloadUrl: asset.url,
    downloadName: asset.name,
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : null
  }
}

async function fetchLatestRelease(): Promise<ReleaseSummary> {
  const response = await net.fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': `Pickview/${app.getVersion()}`
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })

  if (!response.ok) {
    throw new Error(`GitHub responded with ${response.status}`)
  }

  const payload = (await response.json()) as GitHubReleaseResponse
  const summary = releaseSummary(payload)
  if (!summary.version) throw new Error('Release has no version')
  return summary
}

function availableResult(summary: ReleaseSummary, currentVersion: string, cached: boolean): UpdateCheckResult {
  return {
    status: isNewerVersion(summary.version, currentVersion) ? 'available' : 'up-to-date',
    currentVersion,
    latestVersion: summary.version,
    releaseName: summary.name,
    releaseUrl: summary.htmlUrl || `https://github.com/${repository}/releases/latest`,
    downloadUrl: summary.downloadUrl,
    downloadName: summary.downloadName,
    publishedAt: summary.publishedAt,
    message: null,
    checkedAt: Date.now(),
    cached
  }
}

function errorResult(message: string, currentVersion: string, cached: boolean): UpdateCheckResult {
  return {
    status: 'error',
    currentVersion,
    latestVersion: null,
    releaseName: null,
    releaseUrl: `https://github.com/${repository}/releases/latest`,
    downloadUrl: null,
    downloadName: null,
    publishedAt: null,
    message,
    checkedAt: Date.now(),
    cached
  }
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('404')) return '更新服务暂不可用，请稍后再试'
  if (message.includes('403') || message.includes('429')) return '检查过于频繁，请稍后再试'
  return '无法连接更新服务，请检查网络后重试'
}

export async function checkForUpdates(automatic = false): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const cache = await readCache()

  if (automatic && cache && Date.now() - cache.lastAttemptAt < CHECK_INTERVAL_MS) {
    return cache.lastSuccess
      ? availableResult(cache.lastSuccess, currentVersion, true)
      : errorResult('暂时无法检查更新', currentVersion, true)
  }

  try {
    const summary = await fetchLatestRelease()
    await writeCache({ repository, lastAttemptAt: Date.now(), lastSuccess: summary })
    return availableResult(summary, currentVersion, false)
  } catch (error) {
    await writeCache({ repository, lastAttemptAt: Date.now(), lastSuccess: cache?.lastSuccess ?? null })
    if (cache?.lastSuccess && isNewerVersion(cache.lastSuccess.version, currentVersion)) {
      return availableResult(cache.lastSuccess, currentVersion, true)
    }
    return errorResult(friendlyError(error), currentVersion, false)
  }
}

export async function openUpdateDownload(url: string): Promise<void> {
  const prefix = `https://github.com/${repository}/releases/`
  if (!url.startsWith(prefix)) throw new Error('无效的下载地址')
  await shell.openExternal(url)
}

export async function openReleasesPage(): Promise<void> {
  await shell.openExternal(`https://github.com/${repository}/releases/latest`)
}
