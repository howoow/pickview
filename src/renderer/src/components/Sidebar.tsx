import { Aperture, FolderPlus } from 'lucide-react'
import type { DirectoryNode, Workspace } from '../../../shared/types'
import { DirectoryTree } from './DirectoryTree'

interface SidebarProps {
  open: boolean
  workspace: Workspace | null
  selectedPath: string
  onSelectDirectory: (node: DirectoryNode) => void
  onOpenFolder: () => void
}

export function Sidebar({
  open,
  workspace,
  selectedPath,
  onSelectDirectory,
  onOpenFolder
}: SidebarProps): React.JSX.Element {
  return (
    <aside
      className={`sidebar${open ? ' is-open' : ' is-collapsed'}`}
      aria-hidden={!open}
      data-open={open}
    >
      <div className="sidebar-inner">
        <div className="sidebar-brand drag-region">
          <div className="brand-mark" aria-hidden="true">
            <Aperture size={15} strokeWidth={2.2} />
          </div>
          <span className="brand-name">捡影</span>
        </div>

        {workspace ? (
          <>
            <div className="sidebar-tree-scroll">
              <DirectoryTree
                key={workspace.rootPath}
                root={workspace.root}
                selectedPath={selectedPath}
                onSelect={onSelectDirectory}
              />
            </div>
            <div className="sidebar-footer">
              <button className="sidebar-open-button" type="button" onClick={onOpenFolder}>
                <FolderPlus size={14} />
                <span>打开文件夹</span>
              </button>
            </div>
          </>
        ) : (
          <div className="sidebar-empty">
            <div className="sidebar-empty-icon">
              <FolderPlus size={19} />
            </div>
            <p>选择一个图片文件夹开始浏览。</p>
            <button className="sidebar-open-button is-prominent" type="button" onClick={onOpenFolder}>
              打开文件夹
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
