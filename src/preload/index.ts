import { contextBridge, ipcRenderer } from 'electron'
import type { PickviewApi, ScanProgress, Workspace } from '../shared/types'

const api: PickviewApi = {
  platform: process.platform,
  initialWorkspace:
    process.argv.find((argument) => argument.startsWith('--pickview-workspace='))?.slice('--pickview-workspace='.length) ??
    null,
  chooseFolder: () => ipcRenderer.invoke('dialog:choose-folder') as Promise<string | null>,
  openWorkspace: (rootPath: string) =>
    ipcRenderer.invoke('workspace:open', rootPath) as Promise<Workspace>,
  revealInFinder: (path: string) => ipcRenderer.invoke('shell:reveal', path) as Promise<void>,
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => callback(progress)
    ipcRenderer.on('workspace:scan-progress', listener)
    return () => ipcRenderer.removeListener('workspace:scan-progress', listener)
  },
  onChooseFolder: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('menu:choose-folder', listener)
    return () => ipcRenderer.removeListener('menu:choose-folder', listener)
  }
}

contextBridge.exposeInMainWorld('pickview', api)
