import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { clearImageIndex, indexImages, installImageProtocol, registerPickviewScheme } from './image-protocol'
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
        `--pickview-workspace=${initialWorkspace}`
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
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
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
    { role: 'windowMenu' }
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

ipcMain.on('workspace:clear', () => clearImageIndex())
