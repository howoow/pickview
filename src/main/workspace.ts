import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'
import { imageSize } from 'image-size'
import type { DirectoryNode, ImageRecord, ScanProgress, Workspace } from '../shared/types'

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.jfif',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.jxl',
  '.svg'
])

const BROWSER_READABLE = new Set([
  '.jpg',
  '.jpeg',
  '.jfif',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.svg'
])

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '$RECYCLE.BIN',
  'System Volume Information'
])

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
interface MutableDirectory extends DirectoryNode {
  children: MutableDirectory[]
}

function imageId(path: string): string {
  return createHash('sha1').update(path).digest('hex').slice(0, 20)
}

function directoryId(path: string): string {
  return createHash('sha1').update(`dir:${path}`).digest('hex').slice(0, 20)
}

function isHidden(name: string): boolean {
  return name.startsWith('.')
}

async function readDimensions(
  path: string
): Promise<{ width: number; height: number } | null> {
  let handle: fs.FileHandle | undefined
  try {
    const imageHeader = Buffer.allocUnsafe(64 * 1024)
    handle = await fs.open(path, 'r')
    const { bytesRead } = await handle.read(imageHeader, 0, imageHeader.length, 0)
    if (!bytesRead) return null
    const result = imageSize(imageHeader.subarray(0, bytesRead))
    if (!result.width || !result.height) return null
    const rotated = typeof result.orientation === 'number' && result.orientation >= 5
    return rotated
      ? { width: result.height, height: result.width }
      : { width: result.width, height: result.height }
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function scanWorkspace(
  rootPath: string,
  onProgress: (progress: ScanProgress) => void
): Promise<Workspace> {
  const startedAt = performance.now()
  const rootStat = await fs.stat(rootPath)
  if (!rootStat.isDirectory()) throw new Error('所选路径不是文件夹')

  const images: ImageRecord[] = []
  let directoryCount = 0
  let lastProgressAt = 0
  let currentDirectory = rootPath

  const emitProgress = (force = false): void => {
    const now = performance.now()
    if (!force && now - lastProgressAt < 120) return
    lastProgressAt = now
    onProgress({
      directories: directoryCount,
      images: images.length,
      currentDirectory
    })
  }

  const visitDirectory = async (absolutePath: string): Promise<MutableDirectory | null> => {
    directoryCount += 1
    currentDirectory = absolutePath
    emitProgress()

    let entries
    try {
      entries = await fs.readdir(absolutePath, { withFileTypes: true })
    } catch {
      return null
    }

    const directories = entries
      .filter((entry) => entry.isDirectory() && !isHidden(entry.name) && !IGNORED_DIRECTORIES.has(entry.name))
      .sort((a, b) => collator.compare(a.name, b.name))

    const files = entries
      .filter((entry) => entry.isFile() && !isHidden(entry.name))
      .filter((entry) => IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .sort((a, b) => collator.compare(a.name, b.name))

    const localImages = await mapWithConcurrency(files, 32, async (entry): Promise<ImageRecord | null> => {
      const path = join(absolutePath, entry.name)
      try {
        const stat = await fs.stat(path)
        const dimensions = await readDimensions(path)
        const extension = extname(entry.name).toLowerCase()
        return {
          id: imageId(path),
          path,
          name: entry.name,
          relativePath: relative(rootPath, path).split(sep).join('/'),
          directoryPath: absolutePath,
          extension,
          size: stat.size,
          width: dimensions?.width ?? 4,
          height: dimensions?.height ?? 3,
          modifiedAt: stat.mtimeMs,
          browserReadable: BROWSER_READABLE.has(extension)
        }
      } catch {
        return null
      }
    })

    const directImages = localImages.filter((image): image is ImageRecord => image !== null)
    images.push(...directImages)
    emitProgress()

    const children: MutableDirectory[] = []
    for (const entry of directories) {
      const child = await visitDirectory(join(absolutePath, entry.name))
      if (child) children.push(child)
    }

    const relativePath = relative(rootPath, absolutePath).split(sep).join('/')
    const node: MutableDirectory = {
      id: directoryId(absolutePath),
      path: absolutePath,
      name: basename(absolutePath),
      relativePath,
      imageCount: directImages.length,
      totalImageCount: directImages.length,
      children
    }
    node.totalImageCount += children.reduce((total, child) => total + child.totalImageCount, 0)
    return node
  }

  const root = await visitDirectory(rootPath)
  if (!root) throw new Error('无法读取该文件夹')
  emitProgress(true)

  images.sort((a, b) => collator.compare(a.relativePath, b.relativePath))

  return {
    rootPath,
    rootName: basename(rootPath),
    root,
    images,
    scannedAt: Date.now(),
    elapsedMs: Math.round(performance.now() - startedAt)
  }
}

export function isSupportedImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path).toLowerCase())
}
