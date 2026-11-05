import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createReadStream, promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { app, net, protocol } from 'electron'
import sharp from 'sharp'
import type { ImageRecord } from '../shared/types'

interface IndexedImage {
  path: string
  modifiedAt: number
  size: number
}

const indexedImages = new Map<string, IndexedImage>()
const execFileAsync = promisify(execFile)
const pendingThumbnails = new Map<string, Promise<{ path: string; type: string }>>()

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jxl': 'image/jxl',
  '.svg': 'image/svg+xml'
}

function digest(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function responseError(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

function cachePathFor(cacheKey: string, extension: string): string {
  return join(app.getPath('userData'), 'cache', 'renders', `${cacheKey}.${extension}`)
}

async function readCached(path: string, type: string): Promise<Response | null> {
  try {
    const data = await fs.readFile(path)
    return new Response(data, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  } catch {
    return null
  }
}

async function renderThumbnailWithSharp(image: IndexedImage, path: string, width: number): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await sharp(image.path, { failOn: 'none', animated: false })
      .rotate()
      .resize({ width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 3, smartSubsample: true })
      .toFile(temporaryPath)
    await fs.rename(temporaryPath, path)
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

async function renderThumbnailWithSips(image: IndexedImage, path: string, width: number): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp.jpg`
  try {
    await execFileAsync('sips', [
      '-s',
      'format',
      'jpeg',
      '-s',
      'formatOptions',
      '86',
      '--resampleHeightWidthMax',
      String(width),
      image.path,
      '--out',
      temporaryPath
    ])
    await fs.rename(temporaryPath, path)
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

async function renderThumbnail(image: IndexedImage, width: number): Promise<{ path: string; type: string }> {
  const cacheKey = digest(`${image.path}:${image.modifiedAt}:${image.size}:thumb:${width}`)
  const webpPath = cachePathFor(cacheKey, 'webp')
  const cachedWebp = await fs.stat(webpPath).catch(() => null)
  if (cachedWebp?.size) return { path: webpPath, type: 'image/webp' }

  const jpegPath = cachePathFor(cacheKey, 'jpg')
  const cachedJpeg = await fs.stat(jpegPath).catch(() => null)
  if (cachedJpeg?.size) return { path: jpegPath, type: 'image/jpeg' }

  const pendingKey = cacheKey
  const existing = pendingThumbnails.get(pendingKey)
  if (existing) return existing

  const work = (async (): Promise<{ path: string; type: string }> => {
    await fs.mkdir(join(app.getPath('userData'), 'cache', 'renders'), { recursive: true })
    try {
      await renderThumbnailWithSharp(image, webpPath, width)
      return { path: webpPath, type: 'image/webp' }
    } catch (error) {
      if (process.platform !== 'darwin') throw error
      await renderThumbnailWithSips(image, jpegPath, width)
      return { path: jpegPath, type: 'image/jpeg' }
    }
  })()

  pendingThumbnails.set(pendingKey, work)
  try {
    return await work
  } finally {
    pendingThumbnails.delete(pendingKey)
  }
}

async function renderFullPreviewWithSips(image: IndexedImage, path: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp.png`
  try {
    await execFileAsync('sips', [
      '-s',
      'format',
      'png',
      '--resampleHeightWidthMax',
      '6144',
      image.path,
      '--out',
      temporaryPath
    ])
    await fs.rename(temporaryPath, path)
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

async function renderFullPreview(image: IndexedImage): Promise<{ path: string; type: string }> {
  const cacheKey = digest(`${image.path}:${image.modifiedAt}:${image.size}:preview`)
  const path = cachePathFor(cacheKey, 'png')
  const cached = await fs.stat(path).catch(() => null)
  if (cached?.size) return { path, type: 'image/png' }

  const pendingKey = `${cacheKey}:full`
  const existing = pendingThumbnails.get(pendingKey)
  if (existing) return existing

  const work = (async (): Promise<{ path: string; type: string }> => {
    await fs.mkdir(join(app.getPath('userData'), 'cache', 'renders'), { recursive: true })
    const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`
    try {
      const metadata = await sharp(image.path, { failOn: 'none' }).metadata()
      const longest = Math.max(metadata.width ?? 0, metadata.height ?? 0)
      const maxDimension = 8192
      const resize =
        longest > maxDimension
          ? { width: maxDimension, height: maxDimension, fit: 'inside' as const }
          : undefined
      await sharp(image.path, { failOn: 'none' })
        .rotate()
        .resize(resize)
        .png({ compressionLevel: 3, adaptiveFiltering: false })
        .toFile(temporaryPath)
      await fs.rename(temporaryPath, path)
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined)
      if (process.platform !== 'darwin') throw error
      await renderFullPreviewWithSips(image, path)
    }
    return { path, type: 'image/png' }
  })()

  pendingThumbnails.set(pendingKey, work)
  try {
    return await work
  } finally {
    pendingThumbnails.delete(pendingKey)
  }
}

export function registerPickviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'pickview',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false
      }
    }
  ])
}

export function indexImages(images: ImageRecord[]): void {
  indexedImages.clear()
  for (const image of images) {
    indexedImages.set(image.id, {
      path: image.path,
      modifiedAt: image.modifiedAt,
      size: image.size
    })
  }
}

export function installImageProtocol(): void {
  protocol.handle('pickview', async (request) => {
    try {
      const url = new URL(request.url)
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const image = indexedImages.get(id)
      if (!image) return responseError(404, 'Image not found')

      if (url.hostname === 'original') {
        try {
          const stream = Readable.toWeb(createReadStream(image.path)) as unknown as ReadableStream<Uint8Array>
          return new Response(stream, {
            headers: {
              'Content-Type': MIME_TYPES[extname(image.path).toLowerCase()] ?? 'application/octet-stream',
              'Cache-Control': 'public, max-age=31536000, immutable'
            }
          })
        } catch {
          return responseError(404, 'Image unavailable')
        }
      }

      if (url.hostname === 'thumb') {
        const requestedWidth = Number(url.searchParams.get('w')) || 480
        const width = Math.max(96, Math.min(1200, Math.round(requestedWidth)))
        const result = await renderThumbnail(image, width)
        return (await readCached(result.path, result.type)) ?? responseError(500, 'Thumbnail unavailable')
      }

      if (url.hostname === 'preview') {
        const result = await renderFullPreview(image)
        return (await readCached(result.path, result.type)) ?? responseError(500, 'Preview unavailable')
      }

      return responseError(404, 'Unknown image route')
    } catch (error) {
      console.error('Image protocol error', error)
      return responseError(500, 'Image failed to load')
    }
  })
}

export function clearImageIndex(): void {
  indexedImages.clear()
}

export function originalImageUrl(id: string): string {
  return `pickview://original/${encodeURIComponent(id)}`
}
