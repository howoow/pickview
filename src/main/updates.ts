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

function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"'
  }
  return value.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi,
    (entity, hex: string | undefined, decimal: string | undefined, name: string | undefined) => {
      if (name) return named[name.toLowerCase()] ?? entity
      const codePoint = Number.parseInt(hex ?? decimal ?? '', hex ? 16 : 10)
      if (!Number.isFinite(codePoint)) return entity
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return entity
      }
    }
  )
}

function xmlText(entry: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(entry)
  if (!match) return ''
  const raw = match[1].trim()
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw)
  return decodeXmlEntities(cdata?.[1] ?? raw)
}

function releaseSummaryFromAtom(xml: string): ReleaseSummary {
  const entry = /<entry\b[^>]*>([\s\S]*?)<\/entry>/i.exec(xml)?.[1]
  if (!entry) throw new Error('Release feed is empty')

  const id = xmlText(entry, 'id')
  const encodedTag = /Repository\/\d+\/([^<]+)$/.exec(id)?.[1]
  const tag = encodedTag ? decodeURIComponent(encodedTag) : ''
  const version = tag.replace(/^v/i, '').trim()
  if (!tag || !version) throw new Error('Release has no version')

  const links = entry.match(/<link\b[^>]*>/gi) ?? []
  const alternateLink = links.find((link) => /\brel="alternate"/i.test(link))
  const encodedHref = alternateLink?.match(/\bhref="([^"]+)"/i)?.[1]
  const href = encodedHref ? decodeXmlEntities(encodedHref) : ''
  const target = href ? new URL(href, 'https://github.com') : null
  const marker = `/${repository.toLowerCase()}/releases/tag/`
  if (
    !target ||
    target.protocol !== 'https:' ||
    target.hostname !== 'github.com' ||
    !target.pathname.toLowerCase().startsWith(marker)
  ) {
    throw new Error('Release feed has an invalid link')
  }

  const platform =
    process.platform === 'darwin'
      ? { name: 'mac', extension: 'dmg' }
      : process.platform === 'win32'
        ? { name: 'win', extension: 'exe' }
        : null
  const arch =
    process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
  const downloadName =
    platform && arch ? `Pickview-${version}-${platform.name}-${arch}.${platform.extension}` : null
  const downloadUrl = downloadName
    ? `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(downloadName)}`
    : null
  const title = xmlText(entry, 'title')
  const updatedAt = xmlText(entry, 'updated')

  return {
    version,
    name: title || `捡影 v${version}`,
    htmlUrl: target.toString(),
    downloadUrl,
    downloadName,
    publishedAt: Number.isNaN(Date.parse(updatedAt)) ? null : updatedAt
  }
}

async function fetchLatestRelease(): Promise<ReleaseSummary> {
  const response = await net.fetch(`https://github.com/${repository}/releases.atom`, {
    headers: {
      Accept: 'application/atom+xml,application/xml;q=0.9,text/xml;q=0.8',
      'Cache-Control': 'no-cache',
      'User-Agent': `Pickview/${app.getVersion()}`
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })

  if (!response.ok) {
    throw new Error(`GitHub responded with ${response.status}`)
  }

  return releaseSummaryFromAtom(await response.text())
}

function responseErrorStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : ''
  const match = message.match(/GitHub responded with (\d{3})/)
  if (!match) return null
  const status = Number(match[1])
  return Number.isFinite(status) ? status : null
}

function shouldRetry(status: number | null): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

async function fetchLatestReleaseWithRetry(): Promise<ReleaseSummary> {
  try {
    return await fetchLatestRelease()
  } catch (error) {
    if (!shouldRetry(responseErrorStatus(error))) throw error
    await new Promise((resolve) => setTimeout(resolve, 600))
    return fetchLatestRelease()
  }
}

function releaseLooksUnavailable(error: unknown): boolean {
  const status = responseErrorStatus(error)
  return status === 404 || status === 410
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (releaseLooksUnavailable(error)) return '尚未发布可下载版本'
  if (message.includes('403') || message.includes('429')) {
    return 'GitHub 请求繁忙，请稍后再试'
  }
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
    const summary = await fetchLatestReleaseWithRetry()
    await writeCache({ repository, lastAttemptAt: Date.now(), lastSuccess: summary })
    return availableResult(summary, currentVersion, false)
  } catch (error) {
    await writeCache({ repository, lastAttemptAt: Date.now(), lastSuccess: cache?.lastSuccess ?? null })
    if (cache?.lastSuccess) {
      return availableResult(cache.lastSuccess, currentVersion, true)
    }
    return errorResult(friendlyError(error), currentVersion, false)
  }
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

export async function openUpdateDownload(url: string): Promise<void> {
  const prefix = `https://github.com/${repository}/releases/`
  if (!url.startsWith(prefix)) throw new Error('无效的下载地址')
  await shell.openExternal(url)
}

export async function openReleasesPage(): Promise<void> {
  await shell.openExternal(`https://github.com/${repository}/releases/latest`)
}
