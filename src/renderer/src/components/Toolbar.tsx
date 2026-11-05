import type { RefObject } from 'react'
import {
  ChevronRight,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sun,
  X
} from 'lucide-react'
import type { DirectoryNode, ThemeMode } from '../../../shared/types'
import { SettingsPopover } from './SettingsPopover'

export interface BreadcrumbItem {
  key: string
  label: string
  node?: DirectoryNode
  current: boolean
  ellipsis?: boolean
}

interface ToolbarProps {
  sidebarOpen: boolean
  breadcrumbs: BreadcrumbItem[]
  hasWorkspace: boolean
  query: string
  searchInputRef: RefObject<HTMLInputElement | null>
  resolvedTheme: 'light' | 'dark'
  theme: ThemeMode
  opacity: number
  settingsOpen: boolean
  onQueryChange: (query: string) => void
  onSelectBreadcrumb: (node: DirectoryNode) => void
  onToggleSidebar: () => void
  onToggleTheme: () => void
  onToggleSettings: () => void
  onCloseSettings: () => void
  onThemeChange: (theme: ThemeMode) => void
  onOpacityChange: (opacity: number) => void
}

export function Toolbar({
  sidebarOpen,
  breadcrumbs,
  hasWorkspace,
  query,
  searchInputRef,
  resolvedTheme,
  theme,
  opacity,
  settingsOpen,
  onQueryChange,
  onSelectBreadcrumb,
  onToggleSidebar,
  onToggleTheme,
  onToggleSettings,
  onCloseSettings,
  onThemeChange,
  onOpacityChange
}: ToolbarProps): React.JSX.Element {
  const currentPath = breadcrumbs.at(-1)?.node?.path

  return (
    <header className={`toolbar drag-region${sidebarOpen ? '' : ' needs-traffic-gap'}`}>
      <div className="toolbar-location">
        <button
          className="icon-button sidebar-toggle no-drag"
          type="button"
          aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          title={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        <nav className="toolbar-breadcrumbs no-drag" aria-label="当前文件夹" title={currentPath}>
          {breadcrumbs.length > 0 ? (
            breadcrumbs.map((item, index) => {
              const canNavigate = Boolean(item.node && !item.current)
              return (
                <span className="breadcrumb-part" key={item.key}>
                  {index > 0 && <ChevronRight size={11} className="breadcrumb-separator" />}
                  {item.ellipsis ? (
                    <span className="breadcrumb-ellipsis">…</span>
                  ) : canNavigate && item.node ? (
                    <button
                      className="breadcrumb-link"
                      type="button"
                      title={item.node.path}
                      onClick={() => onSelectBreadcrumb(item.node as DirectoryNode)}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <span
                      className={`breadcrumb-current${item.current ? ' is-current' : ''}`}
                      title={item.node?.path}
                    >
                      {item.label}
                    </span>
                  )}
                </span>
              )
            })
          ) : (
            <span className="breadcrumb-placeholder">未打开文件夹</span>
          )}
        </nav>
      </div>

      <div className="search-shell no-drag">
        <Search size={15} className="search-icon" />
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          placeholder="搜索当前工作区"
          aria-label="模糊搜索当前工作区"
          spellCheck={false}
          disabled={!hasWorkspace}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onQueryChange('')
              event.currentTarget.blur()
            }
          }}
        />
        {query ? (
          <button
            className="search-clear"
            type="button"
            aria-label="清除搜索"
            onClick={() => {
              onQueryChange('')
              searchInputRef.current?.focus()
            }}
          >
            <X size={13} />
          </button>
        ) : (
          <span className="search-shortcut">⌘K</span>
        )}
      </div>

      <div className="toolbar-actions no-drag">
        <button
          className="icon-button"
          type="button"
          title={resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          aria-label={resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          onClick={onToggleTheme}
        >
          {resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <div className="settings-anchor">
          <button
            className={`icon-button${settingsOpen ? ' is-active' : ''}`}
            type="button"
            title="界面设置"
            aria-label="界面设置"
            data-settings-trigger
            onClick={onToggleSettings}
          >
            <Settings2 size={17} />
          </button>
          {settingsOpen && (
            <SettingsPopover
              theme={theme}
              opacity={opacity}
              onThemeChange={onThemeChange}
              onOpacityChange={onOpacityChange}
              onClose={onCloseSettings}
            />
          )}
        </div>
      </div>
    </header>
  )
}
