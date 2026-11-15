import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  app,
  BrowserWindow,
  ClipboardItem,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  shell
} from 'electron'

const execFileAsync = promisify(execFile)

function isExistingImage(path: string): Promise<boolean> {
  return fs.stat(path).then((info) => info.isFile()).catch(() => false)
}

async function reportError(window: BrowserWindow, message: string, error: unknown): Promise<void> {
  if (window.isDestroyed()) return
  const detail = error instanceof Error ? error.message : String(error)
  await dialog.showMessageBox(window, {
    type: 'error',
    title: '图片操作失败',
    message,
    detail,
    buttons: ['好'],
    noLink: true
  })
}

async function copyImage(window: BrowserWindow, path: string): Promise<void> {
  try {
    if (!(await isExistingImage(path))) throw new Error('图片文件不存在或不可访问')
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) throw new Error('当前格式无法写入系统剪贴板')
    const png = image.toPNG()
    if (!png.length) throw new Error('图片无法转换为剪贴板格式')
    const pngBytes = Uint8Array.from(png)
    await clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([pngBytes], { type: 'image/png' })
      })
    ])
  } catch (error) {
    await reportError(window, '无法复制这张图片', error)
  }
}

async function saveImageAs(window: BrowserWindow, path: string): Promise<void> {
  try {
    if (!(await isExistingImage(path))) throw new Error('图片文件不存在或不可访问')
    const extension = extname(path).slice(1)
    const result = await dialog.showSaveDialog(window, {
      title: '另存图片',
      defaultPath: join(app.getPath('pictures'), basename(path)),
      filters: extension ? [{ name: '图片', extensions: [extension] }] : undefined,
      properties: ['showOverwriteConfirmation', 'createDirectory']
    })
    if (result.canceled || !result.filePath) return
    if (result.filePath === path) return
    await fs.copyFile(path, result.filePath)
  } catch (error) {
    await reportError(window, '无法保存这张图片', error)
  }
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function setMacWallpaper(path: string): Promise<void> {
  const quotedPath = `"${escapeAppleScript(path)}"`
  const finderScript = `tell application "Finder" to set desktop picture to POSIX file ${quotedPath}`
  try {
    await execFileAsync('osascript', ['-e', finderScript])
  } catch {
    const systemEventsScript = `tell application "System Events" to set picture of every desktop to ${quotedPath}`
    await execFileAsync('osascript', ['-e', systemEventsScript])
  }
}

function escapePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function setWindowsWallpaper(path: string): Promise<void> {
  const script = `
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public static class PickviewWallpaper {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool SystemParametersInfo(int action, int param, string value, int flags);
}
"@
$ok = [PickviewWallpaper]::SystemParametersInfo(20, 0, ${escapePowerShell(path)}, 3)
if (-not $ok) { exit 1 }
`
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')
  ])
}

async function setWallpaper(window: BrowserWindow, path: string): Promise<void> {
  try {
    if (!(await isExistingImage(path))) throw new Error('图片文件不存在或不可访问')
    if (process.platform === 'darwin') {
      await setMacWallpaper(path)
    } else if (process.platform === 'win32') {
      await setWindowsWallpaper(path)
    } else {
      throw new Error('当前平台暂不支持设置桌面壁纸')
    }
  } catch (error) {
    await reportError(window, '无法设置桌面壁纸', error)
  }
}

export async function showImageContextMenu(window: BrowserWindow, path: string): Promise<void> {
  if (!(await isExistingImage(path))) return

  const menu = Menu.buildFromTemplate([
    {
      label: '复制图片',
      click: () => void copyImage(window, path)
    },
    {
      label: '另存为…',
      click: () => void saveImageAs(window, path)
    },
    {
      label: '设置为桌面壁纸',
      click: () => void setWallpaper(window, path)
    },
    { type: 'separator' },
    {
      label: process.platform === 'darwin' ? '在访达中显示' : '在文件资源管理器中显示',
      click: () => shell.showItemInFolder(path)
    }
  ])
  menu.popup({ window })
}
