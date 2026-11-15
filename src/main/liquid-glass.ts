import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { app } from 'electron'

export type GlassAppearance = 'light' | 'dark'

interface NativeGlassView {
  addView: (
    handle: Buffer,
    options: {
      cornerRadius?: number
      tintColor?: string
      opaque?: boolean
    }
  ) => number
}

interface NativeGlassModule {
  LiquidGlassNative: new () => NativeGlassView
}

const requireNative = createRequire(__filename)

let nativeConstructor: (new () => NativeGlassView) | null | undefined
let activeWindow: BrowserWindow | null = null
let activeViewId: number | null = null
let activeAppearance: GlassAppearance | null = null

const GLASS_TINT: Record<GlassAppearance, string> = {
  light: '#F7F7F51F',
  dark: '#11121429'
}

function nativeAddonPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'native', 'liquid-glass', `${process.arch}.node`)
  }

  const prebuild =
    process.arch === 'arm64'
      ? ['darwin-arm64', 'node.napi.armv8.node']
      : ['darwin-x64', 'node.napi.node']
  return join(
    __dirname,
    '../../node_modules/electron-liquid-glass/prebuilds',
    prebuild[0],
    prebuild[1]
  )
}

function loadNativeConstructor(): (new () => NativeGlassView) | null {
  if (nativeConstructor !== undefined) return nativeConstructor
  nativeConstructor = null

  if (process.platform !== 'darwin') return null

  try {
    const addonPath = nativeAddonPath()
    if (!existsSync(addonPath)) return null
    const addon = requireNative(addonPath) as NativeGlassModule
    if (typeof addon.LiquidGlassNative !== 'function') return null
    nativeConstructor = addon.LiquidGlassNative
  } catch (error) {
    console.warn('[liquid-glass] Native material unavailable, using window vibrancy.', error)
  }

  return nativeConstructor
}

export function isLiquidGlassSupported(): boolean {
  if (process.platform !== 'darwin') return false

  const systemVersion = process.getSystemVersion?.() ?? ''
  if (Number(systemVersion.split('.')[0]) < 26) return false

  return loadNativeConstructor() !== null
}

function attachLiquidGlass(
  window: BrowserWindow,
  appearance: GlassAppearance
): boolean {
  const Constructor = loadNativeConstructor()
  if (!Constructor) return false

  try {
    window.setWindowButtonVisibility(true)
    const glass = new Constructor()
    const viewId = glass.addView(window.getNativeWindowHandle(), {
      cornerRadius: 0,
      tintColor: GLASS_TINT[appearance],
      opaque: false
    })
    if (viewId < 0) return false

    activeWindow = window
    activeViewId = viewId
    activeAppearance = appearance
    return true
  } catch (error) {
    console.warn('[liquid-glass] Failed to attach native material.', error)
    activeWindow = null
    activeViewId = null
    activeAppearance = null
    return false
  }
}

export function ensureLiquidGlass(
  window: BrowserWindow,
  appearance: GlassAppearance
): boolean {
  if (activeWindow === window && activeViewId !== null) return true
  return attachLiquidGlass(window, appearance)
}

export function updateLiquidGlassAppearance(
  window: BrowserWindow,
  appearance: GlassAppearance
): boolean {
  if (activeWindow === window && activeViewId !== null && activeAppearance === appearance) {
    return true
  }

  return attachLiquidGlass(window, appearance)
}

export function enableVibrancyFallback(window: BrowserWindow): void {
  try {
    window.setVibrancy('under-window')
  } catch {
    // The window may be closing; there is nothing else to restore in that case.
  }
}
