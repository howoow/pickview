import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { clearImageIndex, indexImages, installImageProtocol, registerPickviewScheme } from './image-protocol'
import { checkForUpdates, openReleasesPage, openUpdateDownload } from './updates'
import { scanWorkspace } from './workspace'

registerPickviewScheme()

if (process.env.PICKVIEW_DEBUG_PORT && !app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.PICKVIEW_DEBUG_PORT)
}

let mainWindow: BrowserWindow | null = null

const initialWorkspace =
  process.env.PICKVIEW_WORKSPACE ??
  process.argv.find((argument) => argument.startsWith('--workspace='))?.slice('--workspace='.length) ??
  ''

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: '捡影',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 17, y: 18 } : undefined,
    transparent: process.platform === 'darwin',
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#111214',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--pickview-workspace=${initialWorkspace}`,
        `--pickview-version=${app.getVersion()}`
      ]
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function installMenu(): void {
  const sendChooseFolder = (): void => mainWindow?.webContents.send('menu:choose-folder')
  const sendCheckUpdates = (): void => mainWindow?.webContents.send('menu:check-updates')
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { label: '检查更新…', click: sendCheckUpdates },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [
        { label: '打开工作区…', accelerator: 'CmdOrCtrl+O', click: sendChooseFolder },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    ...(process.platform === 'darwin'
      ? []
      : [
          {
            label: '帮助',
            submenu: [
              { label: '检查更新…', click: sendCheckUpdates },
              { label: 'GitHub 发布页', click: () => void openReleasesPage() },
              { type: 'separator' as const },
              { role: 'about' as const }
            ]
          }
        ])
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  app.setName('捡影')
  if (process.env.ELECTRON_RENDERER_URL && process.platform === 'darwin') {
    app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
  }
  installImageProtocol()
  installMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('dialog:choose-folder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择图片工作区',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('workspace:open', async (event, rootPath: unknown) => {
  if (typeof rootPath !== 'string' || !rootPath) throw new Error('无效的工作区路径')
  const absolutePath = rootPath
  const info = await stat(absolutePath).catch(() => null)
  if (!info?.isDirectory()) throw new Error('工作区不存在或不可访问')

  const workspace = await scanWorkspace(absolutePath, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('workspace:scan-progress', progress)
  })
  indexImages(workspace.images)
  return workspace
})

ipcMain.handle('shell:reveal', async (_event, path: unknown) => {
  if (typeof path !== 'string') return
  shell.showItemInFolder(path)
})

ipcMain.handle('app:uninstall', async () => {
  if (process.platform !== 'win32') throw new Error('仅 Windows 支持应用内卸载')
  if (!mainWindow) return

  const installDirectory = dirname(app.getPath('exe'))
  let uninstallerPath: string | null = null
  const preferred = join(installDirectory, `Uninstall ${app.getName()}.exe`)
  if ((await stat(preferred).catch(() => null))?.isFile()) {
    uninstallerPath = preferred
  } else {
    const entries = await readdir(installDirectory).catch(() => [])
    const candidate = entries.find((name) => /^uninstall.*\.exe$/i.test(name))
    if (candidate) uninstallerPath = join(installDirectory, candidate)
  }

  if (!uninstallerPath) {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '卸载捡影',
      message: '没有找到应用内卸载程序',
      detail: '已为你打开 Windows 的“应用和功能”，请在那里卸载捡影。',
      buttons: ['好'],
      noLink: true
    })
    await shell.openExternal('ms-settings:appsfeatures')
    return
  }

  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '卸载捡影',
    message: '确定要卸载捡影吗？',
    detail: '将启动 Windows 卸载程序，应用会退出。缩略图缓存、最近工作区与界面设置会一并删除。',
    buttons: ['取消', '卸载'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  if (confirmation.response !== 1) return

  spawn(uninstallerPath, [], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => app.quit(), 300)
})

ipcMain.handle('updates:check', async (_event, automatic: unknown) =>
  checkForUpdates(automatic === true)
)

ipcMain.handle('updates:open-download', async (_event, url: unknown) => {
  if (typeof url !== 'string' || !url) throw new Error('无效的下载地址')
  await openUpdateDownload(url)
})

ipcMain.handle('updates:open-releases', async () => openReleasesPage())

ipcMain.on('workspace:clear', () => clearImageIndex())
