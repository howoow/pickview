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

export interface PickviewApi {
  platform: NodeJS.Platform
  initialWorkspace: string | null
  chooseFolder: () => Promise<string | null>
  openWorkspace: (rootPath: string) => Promise<Workspace>
  revealInFinder: (path: string) => Promise<void>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  onChooseFolder: (callback: () => void) => () => void
}
