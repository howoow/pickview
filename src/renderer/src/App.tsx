import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import {
  AlertCircle,
  ArrowDownWideNarrow,
  CalendarClock,
  Columns3,
  Folder,
  Grid3X3,
  HardDrive,
  Image as ImageIcon,
  LoaderCircle,
  X
} from 'lucide-react'
import type {
  DirectoryNode,
  LayoutMode,
  ScanProgress,
  ThemeMode,
  UpdateCheckResult,
  Workspace
} from '../../shared/types'
import { Gallery } from './components/Gallery'
import { ImageViewer } from './components/ImageViewer'
import { Sidebar } from './components/Sidebar'
import { Toolbar, type BreadcrumbItem } from './components/Toolbar'
import { Welcome, type RecentWorkspace } from './components/Welcome'
import { usePersistedState } from './hooks/usePersistedState'
import { useWorkspaceSearch } from './hooks/useWorkspaceSearch'

type SortMode = 'name' | 'newest' | 'largest'
type ThumbnailSize = 'small' | 'medium' | 'large'

const THUMBNAIL_PIXELS: Record<ThumbnailSize, number> = {
  small: 176,
  medium: 236,
  large: 312
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function workspaceNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function useSystemTheme(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent): void => setDark(event.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])
  return dark
}

function findDirectory(node: DirectoryNode, path: string): DirectoryNode | null {
  if (node.path === path) return node
  for (const child of node.children) {
    const match = findDirectory(child, path)
    if (match) return match
  }
  return null
}

function firstDirectoryWithImages(node: DirectoryNode): DirectoryNode {
  if (node.imageCount > 0) return node
  for (const child of node.children) {
    const match = firstDirectoryWithImages(child)
    if (match.imageCount > 0) return match
  }
  return node
}

function sortImages(images: Workspace['images'], mode: SortMode): Workspace['images'] {
  const sorted = [...images]
  if (mode === 'newest') sorted.sort((a, b) => b.modifiedAt - a.modifiedAt)
  else if (mode === 'largest') sorted.sort((a, b) => b.size - a.size)
  else sorted.sort((a, b) => collator.compare(a.relativePath, b.relativePath))
  return sorted
}

function runViewTransition(update: () => void): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion || typeof document.startViewTransition !== 'function') {
    update()
    return
  }

  try {
    document.startViewTransition(() => {
      flushSync(update)
    })
  } catch {
    update()
  }
}

function buildBreadcrumbs(
  workspace: Workspace | null,
  selectedDirectory: DirectoryNode | null,
  isSearching: boolean
): BreadcrumbItem[] {
  if (!workspace) return []

  const trail: DirectoryNode[] = [workspace.root]
  if (!isSearching && selectedDirectory && selectedDirectory.path !== workspace.rootPath) {
    let current = workspace.root
    for (const segment of selectedDirectory.relativePath.split('/').filter(Boolean)) {
      const child = current.children.find((candidate) => candidate.name === segment)
      if (!child) break
      current = child
      trail.push(child)
    }
  }

  let items: BreadcrumbItem[] = trail.map((node) => ({
    key: node.path,
    label: node.name,
    node,
    current: false
  }))

  if (isSearching) {
    items = [items[0], { key: 'search', label: '全工作区', current: true }]
  } else if (items.length > 4) {
    items = [
      items[0],
      { key: 'ellipsis', label: '…', ellipsis: true, current: false },
      ...items.slice(-2)
    ]
  }

  return items.map((item, index) => ({ ...item, current: index === items.length - 1 }))
}

export default function App(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [heroId, setHeroId] = useState<string | null>(null)
  const [viewerPreview, setViewerPreview] = useState<{
    imageId: string
    url: string
  } | null>(null)

  const [theme, setTheme] = usePersistedState<ThemeMode>('pickview.theme', 'system')
  const [opacity, setOpacity] = usePersistedState<number>('pickview.opacity', 0.86)
  const [layoutMode, setLayoutMode] = usePersistedState<LayoutMode>('pickview.layout', 'masonry')
  const [thumbnailSize, setThumbnailSize] = usePersistedState<ThumbnailSize>(
    'pickview.thumbnailSize',
    'medium'
  )
  const [sortMode, setSortMode] = usePersistedState<SortMode>('pickview.sort', 'name')
  const [recents, setRecents] = usePersistedState<RecentWorkspace[]>('pickview.recents', [])

  const searchInputRef = useRef<HTMLInputElement>(null)
  const initialWorkspaceOpened = useRef(false)
  const systemDark = useSystemTheme()
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  const normalizedQuery = query.trim()
  const isSearching = normalizedQuery.length > 0
  const search = useWorkspaceSearch(workspace, query)

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const rememberWorkspace = useCallback(
    (path: string) => {
      const name = workspaceNameFromPath(path)
      setRecents([
        { path, name, openedAt: Date.now() },
        ...recents.filter((recent) => recent.path !== path)
      ].slice(0, 5))
    },
    [recents, setRecents]
  )

  const loadWorkspace = useCallback(
    async (path: string) => {
      setScanning(true)
      setScanProgress(null)
      setError(null)
      setViewerIndex(null)
      try {
        const nextWorkspace = await window.pickview.openWorkspace(path)
        setWorkspace(nextWorkspace)
        setSelectedPath(firstDirectoryWithImages(nextWorkspace.root).path)
        setQuery('')
        rememberWorkspace(nextWorkspace.rootPath)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '无法打开这个工作区')
      } finally {
        setScanning(false)
      }
    },
    [rememberWorkspace]
  )

  const chooseFolder = useCallback(async () => {
    try {
      const path = await window.pickview.chooseFolder()
      if (path) await loadWorkspace(path)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法选择文件夹')
    }
  }, [loadWorkspace])

  const runUpdateCheck = useCallback(async (automatic = false) => {
    if (!automatic) setSettingsOpen(true)
    setCheckingUpdates(true)
    try {
      const result = await window.pickview.checkUpdates(automatic)
      if (automatic && result.status === 'error') return
      setUpdateInfo(result)
    } catch {
      if (automatic) return
      setUpdateInfo({
        status: 'error',
        currentVersion: window.pickview.appVersion,
        latestVersion: null,
        releaseName: null,
        releaseUrl: null,
        downloadUrl: null,
        downloadName: null,
        publishedAt: null,
        message: '无法连接更新服务，请检查网络后重试',
        checkedAt: Date.now(),
        cached: false
      })
    } finally {
      setCheckingUpdates(false)
    }
  }, [])

  useEffect(() => window.pickview.onScanProgress(setScanProgress), [])
  useEffect(() => window.pickview.onChooseFolder(() => void chooseFolder()), [chooseFolder])
  useEffect(() => window.pickview.onCheckUpdates(() => void runUpdateCheck(false)), [runUpdateCheck])

  useEffect(() => {
    const timer = window.setTimeout(() => void runUpdateCheck(true), 5000)
    return () => window.clearTimeout(timer)
  }, [runUpdateCheck])

  useEffect(() => {
    if (!window.pickview.initialWorkspace || initialWorkspaceOpened.current) return
    initialWorkspaceOpened.current = true
    void loadWorkspace(window.pickview.initialWorkspace)
  }, [loadWorkspace])

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(null), 6500)
    return () => window.clearTimeout(timer)
  }, [error])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (viewerIndex !== null) return
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [viewerIndex])

  const selectedDirectory = useMemo(
    () => (workspace ? findDirectory(workspace.root, selectedPath) ?? workspace.root : null),
    [selectedPath, workspace]
  )

  const folderImages = useMemo(() => {
    if (!workspace || !selectedDirectory) return []
    const direct = workspace.images.filter((image) => image.directoryPath === selectedDirectory.path)
    return sortImages(direct, sortMode)
  }, [selectedDirectory, sortMode, workspace])

  const searchImages = useMemo(() => {
    if (!workspace || !search.indices) return []
    return search.indices
      .map((index) => workspace.images[index])
      .filter((image): image is Workspace['images'][number] => Boolean(image))
  }, [search.indices, workspace])

  const displayedImages = isSearching ? searchImages : folderImages
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(workspace, selectedDirectory, isSearching),
    [isSearching, selectedDirectory, workspace]
  )

  const handleSelectDirectory = (node: DirectoryNode): void => {
    setSelectedPath(node.path)
    setQuery('')
    setViewerIndex(null)
    searchInputRef.current?.blur()
  }

  const handleOpenViewer = (index: number, previewUrl: string): void => {
    const image = displayedImages[index]
    if (!image) return
    flushSync(() => {
      setHeroId(image.id)
      setViewerPreview({ imageId: image.id, url: previewUrl })
    })
    runViewTransition(() => setViewerIndex(index))
  }

  const handleViewerIndexChange = (index: number): void => {
    const image = displayedImages[index]
    if (image) setHeroId(image.id)
    setViewerIndex(index)
  }

  const handleCloseViewer = (): void => {
    if (viewerIndex !== null) {
      const image = displayedImages[viewerIndex]
      if (image) flushSync(() => setHeroId(image.id))
    }
    runViewTransition(() => setViewerIndex(null))
  }

  const handleThemeToggle = (): void => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  const handleOpenUpdateDownload = (): void => {
    const url = updateInfo?.downloadUrl ?? updateInfo?.releaseUrl
    if (!url) return
    void window.pickview.openUpdateDownload(url).catch(() => {
      void window.pickview.openReleasesPage()
    })
  }

  const handleUninstall = (): void => {
    void window.pickview.uninstall().catch((caught) => {
      setError(caught instanceof Error ? caught.message : '无法启动卸载程序')
    })
  }

  const gallerySummary = isSearching
    ? `“${normalizedQuery}” · ${search.total.toLocaleString('zh-CN')} 张`
    : `${folderImages.length.toLocaleString('zh-CN')} 张照片`
  const galleryDetail = isSearching
    ? search.searching
      ? '正在检索…'
      : `${search.elapsedMs.toFixed(1)} ms`
    : ''

  return (
    <div
      className={`app-shell platform-${window.pickview.platform}${sidebarOpen ? '' : ' sidebar-collapsed'}`}
      style={{ '--ui-opacity': opacity } as CSSProperties}
    >
      <Sidebar
        open={sidebarOpen}
        workspace={workspace}
        selectedPath={selectedPath}
        onSelectDirectory={handleSelectDirectory}
        onOpenFolder={() => void chooseFolder()}
      />

      <main className="main-panel">
        <Toolbar
          sidebarOpen={sidebarOpen}
          breadcrumbs={breadcrumbs}
          hasWorkspace={Boolean(workspace)}
          query={query}
          searchInputRef={searchInputRef}
          resolvedTheme={resolvedTheme}
          theme={theme}
          opacity={opacity}
          appVersion={window.pickview.appVersion}
          canUninstall={window.pickview.canUninstall}
          updateInfo={updateInfo}
          checkingUpdates={checkingUpdates}
          settingsOpen={settingsOpen}
          onQueryChange={setQuery}
          onSelectBreadcrumb={handleSelectDirectory}
          onToggleSidebar={() => setSidebarOpen((current) => !current)}
          onToggleTheme={handleThemeToggle}
          onToggleSettings={() => setSettingsOpen((current) => !current)}
          onCloseSettings={() => setSettingsOpen(false)}
          onThemeChange={setTheme}
          onOpacityChange={setOpacity}
          onCheckUpdates={() => void runUpdateCheck(false)}
          onOpenDownload={handleOpenUpdateDownload}
          onOpenReleasesPage={() => void window.pickview.openReleasesPage()}
          onUninstall={handleUninstall}
        />

        {workspace ? (
          <>
            <section className="gallery-header">
              <div className="gallery-summary" aria-live="polite">
                <span>{gallerySummary}</span>
                {galleryDetail && <span className="gallery-summary-detail">{galleryDetail}</span>}
                {search.searching && <LoaderCircle size={12} className="spin" />}
              </div>

              <div className="gallery-controls">
                {!isSearching && (
                  <label className="sort-control" title="排序方式">
                    {sortMode === 'newest' ? (
                      <CalendarClock size={14} />
                    ) : sortMode === 'largest' ? (
                      <HardDrive size={14} />
                    ) : (
                      <ArrowDownWideNarrow size={14} />
                    )}
                    <select
                      value={sortMode}
                      aria-label="排序方式"
                      onChange={(event) => setSortMode(event.target.value as SortMode)}
                    >
                      <option value="name">名称</option>
                      <option value="newest">最近修改</option>
                      <option value="largest">文件大小</option>
                    </select>
                  </label>
                )}

                <div className="segmented-control size-segment" role="group" aria-label="缩略图大小">
                  {(['small', 'medium', 'large'] as const).map((size) => (
                    <button
                      key={size}
                      className={thumbnailSize === size ? 'is-active' : ''}
                      type="button"
                      aria-pressed={thumbnailSize === size}
                      title={`${size === 'small' ? '小' : size === 'medium' ? '中' : '大'}尺寸缩略图`}
                      onClick={() => setThumbnailSize(size)}
                    >
                      {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                    </button>
                  ))}
                </div>

                <div className="segmented-control layout-segment" role="group" aria-label="布局方式">
                  <button
                    className={layoutMode === 'masonry' ? 'is-active' : ''}
                    type="button"
                    title="瀑布流布局"
                    aria-label="瀑布流布局"
                    onClick={() => setLayoutMode('masonry')}
                  >
                    <Columns3 size={15} />
                  </button>
                  <button
                    className={layoutMode === 'grid' ? 'is-active' : ''}
                    type="button"
                    title="整齐网格"
                    aria-label="整齐网格"
                    onClick={() => setLayoutMode('grid')}
                  >
                    <Grid3X3 size={15} />
                  </button>
                </div>
              </div>
            </section>

            <Gallery
              images={displayedImages}
              mode={layoutMode}
              targetSize={THUMBNAIL_PIXELS[thumbnailSize]}
              gap={layoutMode === 'grid' ? 8 : 12}
              showPath={isSearching}
              heroId={viewerIndex === null ? heroId : null}
              resetKey={`${isSearching ? 'search' : selectedPath}:${isSearching ? normalizedQuery : ''}`}
              onOpen={handleOpenViewer}
            />

            <footer className="statusbar">
              <span className="statusbar-item">
                <ImageIcon size={12} />
                {isSearching
                  ? `${search.total.toLocaleString('zh-CN')} 个匹配`
                  : `${folderImages.length.toLocaleString('zh-CN')} 张图片`}
              </span>
              <span className="statusbar-spacer" />
              {workspace && (
                <span className="statusbar-item statusbar-index">
                  已索引 {workspace.images.length.toLocaleString('zh-CN')} 张 · {layoutMode === 'masonry' ? '瀑布流' : '网格'}
                </span>
              )}
            </footer>
          </>
        ) : (
          <Welcome recents={recents} onOpenFolder={() => void chooseFolder()} onOpenRecent={(path) => void loadWorkspace(path)} />
        )}
      </main>

      {scanning && (
        <div className="scan-overlay">
          <div className="scan-card">
            <div className="scan-mark">
              <Folder size={22} />
              <span className="scan-pulse" />
            </div>
            <div className="scan-copy">
              <h2>正在整理你的图片…</h2>
              <p title={scanProgress?.currentDirectory}>
                {scanProgress?.currentDirectory
                  ? workspaceNameFromPath(scanProgress.currentDirectory)
                  : '读取目录结构中'}
              </p>
              <div className="scan-progress-track">
                <span />
              </div>
              <div className="scan-stats">
                <span>{scanProgress?.directories ?? 0} 个文件夹</span>
                <span>{scanProgress?.images ?? 0} 张图片</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-toast" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {viewerIndex !== null && displayedImages[viewerIndex] && (
        <ImageViewer
          images={displayedImages}
          activeIndex={viewerIndex}
          initialImageId={viewerPreview?.imageId ?? null}
          initialPreviewUrl={viewerPreview?.url ?? null}
          onIndexChange={handleViewerIndexChange}
          onClose={handleCloseViewer}
          onReveal={(image) => void window.pickview.revealInFinder(image.path)}
        />
      )}
    </div>
  )
}
