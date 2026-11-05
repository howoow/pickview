import { contextBridge, ipcRenderer } from 'electron'
import type { PickviewApi, ScanProgress, UpdateCheckResult, Workspace } from '../shared/types'

const api: PickviewApi = {
  platform: process.platform,
  appVersion:
    process.argv.find((argument) => argument.startsWith('--pickview-version='))?.slice('--pickview-version='.length) ??
    '',
  canUninstall: process.platform === 'win32',
  initialWorkspace:
    process.argv.find((argument) => argument.startsWith('--pickview-workspace='))?.slice('--pickview-workspace='.length) ??
    null,
  chooseFolder: () => ipcRenderer.invoke('dialog:choose-folder') as Promise<string | null>,
  openWorkspace: (rootPath: string) =>
    ipcRenderer.invoke('workspace:open', rootPath) as Promise<Workspace>,
  revealInFinder: (path: string) => ipcRenderer.invoke('shell:reveal', path) as Promise<void>,
  checkUpdates: (automatic = false) =>
    ipcRenderer.invoke('updates:check', automatic) as Promise<UpdateCheckResult>,
  openUpdateDownload: (url: string) =>
    ipcRenderer.invoke('updates:open-download', url) as Promise<void>,
  openReleasesPage: () => ipcRenderer.invoke('updates:open-releases') as Promise<void>,
  uninstall: () => ipcRenderer.invoke('app:uninstall') as Promise<void>,
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => callback(progress)
    ipcRenderer.on('workspace:scan-progress', listener)
    return () => ipcRenderer.removeListener('workspace:scan-progress', listener)
  },
  onChooseFolder: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('menu:choose-folder', listener)
    return () => ipcRenderer.removeListener('menu:choose-folder', listener)
  },
  onCheckUpdates: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('menu:check-updates', listener)
    return () => ipcRenderer.removeListener('menu:check-updates', listener)
  }
}

contextBridge.exposeInMainWorld('pickview', api)
