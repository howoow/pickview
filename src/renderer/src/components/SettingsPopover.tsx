import { useEffect, useRef } from 'react'
import { ArrowDownToLine, LoaderCircle, Monitor, Moon, RefreshCw, Sun, Trash2, X } from 'lucide-react'
import type { ThemeMode, UpdateCheckResult } from '../../../shared/types'

interface SettingsPopoverProps {
  theme: ThemeMode
  opacity: number
  appVersion: string
  canUninstall: boolean
  updateInfo: UpdateCheckResult | null
  checkingUpdates: boolean
  onThemeChange: (theme: ThemeMode) => void
  onOpacityChange: (opacity: number) => void
  onCheckUpdates: () => void
  onOpenDownload: () => void
  onOpenReleasesPage: () => void
  onUninstall: () => void
  onClose: () => void
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor }
]

export function SettingsPopover({
  theme,
  opacity,
  appVersion,
  canUninstall,
  updateInfo,
  checkingUpdates,
  onThemeChange,
  onOpacityChange,
  onCheckUpdates,
  onOpenDownload,
  onOpenReleasesPage,
  onUninstall,
  onClose
}: SettingsPopoverProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const updateAvailable = updateInfo?.status === 'available'
  const updateState = checkingUpdates
    ? '正在检查…'
    : updateInfo?.status === 'available'
      ? `新版本 v${updateInfo.latestVersion} 可用`
      : updateInfo?.status === 'up-to-date'
        ? '已是最新版本'
        : updateInfo?.status === 'error'
          ? (updateInfo.message ?? '暂时无法检查更新')
          : '启动时自动检查'

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (panelRef.current?.contains(event.target as Node)) return
      if ((event.target as Element | null)?.closest('[data-settings-trigger]')) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div className="settings-popover" ref={panelRef} role="dialog" aria-label="界面设置">
      <div className="popover-header">
        <h2>界面设置</h2>
        <button className="icon-button" type="button" aria-label="关闭设置" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <div className="settings-block">
        <div className="settings-label">主题</div>
        <div className="theme-segment" role="group" aria-label="主题模式">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.value}
                className={theme === option.value ? 'is-active' : ''}
                type="button"
                onClick={() => onThemeChange(option.value)}
              >
                <Icon size={14} />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="settings-block">
        <div className="settings-label-row">
          <span className="settings-label">界面透明度</span>
          <span className="settings-value">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          className="range-input"
          type="range"
          min="55"
          max="100"
          step="1"
          value={Math.round(opacity * 100)}
          aria-label="界面透明度"
          onChange={(event) => onOpacityChange(Number(event.target.value) / 100)}
        />
        <p className="settings-help">降低界面底色，让桌面背景透进来。图片始终保持不透明。</p>
      </div>

      <div className="settings-block">
        <div className="settings-label-row">
          <span className="settings-label">版本与更新</span>
          <span className="settings-value">{appVersion ? `v${appVersion}` : '—'}</span>
        </div>
        <div className="update-row">
          <span
            className={`update-state${updateInfo?.status === 'error' ? ' is-error' : ''}${updateAvailable ? ' is-available' : ''}`}
            aria-live="polite"
          >
            {updateState}
          </span>
          {updateAvailable ? (
            <button className="update-button is-primary" type="button" onClick={onOpenDownload}>
              <ArrowDownToLine size={12} />
              下载
            </button>
          ) : (
            <button
              className="update-button"
              type="button"
              disabled={checkingUpdates}
              onClick={onCheckUpdates}
            >
              {checkingUpdates ? (
                <LoaderCircle size={12} className="spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              检查更新
            </button>
          )}
        </div>
        {(updateAvailable || updateInfo?.status === 'error') && (
          <button className="update-link" type="button" onClick={onOpenReleasesPage}>
            查看 GitHub 发布页
          </button>
        )}
      </div>

      <div className="popover-footer">
        <span>本地优先</span>
        <span>MIT</span>
      </div>

      {canUninstall && (
        <div className="settings-block uninstall-block">
          <button className="uninstall-button" type="button" onClick={onUninstall}>
            <Trash2 size={12} />
            卸载捡影…
          </button>
        </div>
      )}
    </div>
  )
}
