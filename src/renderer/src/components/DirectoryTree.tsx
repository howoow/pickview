import { useEffect, useState } from 'react'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import type { DirectoryNode } from '../../../shared/types'

interface DirectoryTreeProps {
  root: DirectoryNode
  selectedPath: string
  onSelect: (node: DirectoryNode) => void
}

interface DirectoryBranchProps {
  node: DirectoryNode
  depth: number
  selectedPath: string
  onSelect: (node: DirectoryNode) => void
}

function formatCount(count: number): string {
  if (count < 1000) return String(count)
  return `${(count / 1000).toFixed(count < 10000 ? 1 : 0)}k`
}

function DirectoryBranch({ node, depth, selectedPath, onSelect }: DirectoryBranchProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(depth === 0)
  const selected = node.path === selectedPath
  const hasChildren = node.children.length > 0

  useEffect(() => {
    if (!selectedPath.startsWith(`${node.path}/`)) return
    setExpanded(true)
  }, [node.path, selectedPath])

  return (
    <div className="tree-branch">
      <div
        className={`tree-row${selected ? ' is-selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        role="button"
        tabIndex={0}
        title={node.path}
        onClick={() => onSelect(node)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect(node)
        }}
      >
        <button
          className={`tree-disclosure${hasChildren ? '' : ' is-empty'}${expanded ? ' is-open' : ''}`}
          type="button"
          aria-label={expanded ? '收起文件夹' : '展开文件夹'}
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((current) => !current)
          }}
        >
          <ChevronRight size={13} strokeWidth={2.1} />
        </button>
        <span className="tree-folder">
          {selected ? <FolderOpen size={16} /> : <Folder size={16} />}
        </span>
        <span className="tree-name">{node.name}</span>
        <span className="tree-count">{formatCount(node.totalImageCount)}</span>
      </div>
      {expanded && hasChildren && (
        <div className="tree-children">
          {node.children.map((child) => (
            <DirectoryBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function DirectoryTree({ root, selectedPath, onSelect }: DirectoryTreeProps): React.JSX.Element {
  return (
    <div className="directory-tree" role="tree" aria-label="目录树">
      <DirectoryBranch node={root} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
    </div>
  )
}
