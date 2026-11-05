export type LayoutMode = 'masonry' | 'grid'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface ImageRecord {
  id: string
  path: string
  name: string
  relativePath: string
  directoryPath: string
  extension: string
  size: number
  width: number
  height: number
  modifiedAt: number
  browserReadable: boolean
}

export interface DirectoryNode {
  id: string
  path: string
  name: string
  relativePath: string
  imageCount: number
  totalImageCount: number
  children: DirectoryNode[]
}

export interface Workspace {
  rootPath: string
  rootName: string
  root: DirectoryNode
  images: ImageRecord[]
  scannedAt: number
  elapsedMs: number
}

export interface ScanProgress {
  directories: number
  images: number
  currentDirectory: string
}

export type UpdateCheckStatus = 'available' | 'up-to-date' | 'error'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  currentVersion: string
  latestVersion: string | null
  releaseName: string | null
  releaseUrl: string | null
  downloadUrl: string | null
  downloadName: string | null
  publishedAt: string | null
  message: string | null
  checkedAt: number
  cached: boolean
}

export interface PickviewApi {
  platform: NodeJS.Platform
  appVersion: string
  canUninstall: boolean
  initialWorkspace: string | null
  chooseFolder: () => Promise<string | null>
  openWorkspace: (rootPath: string) => Promise<Workspace>
  revealInFinder: (path: string) => Promise<void>
  checkUpdates: (automatic?: boolean) => Promise<UpdateCheckResult>
  openUpdateDownload: (url: string) => Promise<void>
  openReleasesPage: () => Promise<void>
  uninstall: () => Promise<void>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  onChooseFolder: (callback: () => void) => () => void
  onCheckUpdates: (callback: () => void) => () => void
}
