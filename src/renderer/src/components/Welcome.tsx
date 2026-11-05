import { ArrowUpRight, Folder, FolderOpen, Search, ShieldCheck, Sparkles } from 'lucide-react'

export interface RecentWorkspace {
  path: string
  name: string
  openedAt: number
}

interface WelcomeProps {
  recents: RecentWorkspace[]
  onOpenFolder: () => void
  onOpenRecent: (path: string) => void
}

export function Welcome({ recents, onOpenFolder, onOpenRecent }: WelcomeProps): React.JSX.Element {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-visual" aria-hidden="true">
          <div className="photo-stack-card stack-back">
            <span className="stack-mountain" />
          </div>
          <div className="photo-stack-card stack-middle">
            <span className="stack-sun" />
          </div>
          <div className="photo-stack-card stack-front">
            <span className="stack-water" />
            <span className="stack-shine" />
          </div>
          <div className="stack-orbit orbit-one" />
          <div className="stack-orbit orbit-two" />
        </div>

        <div className="welcome-copy">
          <span className="welcome-eyebrow">
            <Sparkles size={13} />
            本地图片工作区
          </span>
          <h1>
            <span>让照片，</span>
            <span>回到视野中央。</span>
          </h1>
          <p className="welcome-lead">
            打开一个文件夹，捡影会整理目录与缩略图。大图保持原样，浏览保持安静。
          </p>
          <div className="welcome-actions">
            <button className="primary-button" type="button" onClick={onOpenFolder}>
              <FolderOpen size={17} />
              <span>打开图片文件夹</span>
              <span className="shortcut-hint">⌘O</span>
            </button>
          </div>
          <div className="welcome-features">
            <span>
              <ShieldCheck size={14} /> 原图本地读取
            </span>
            <span>
              <Search size={14} /> 全工作区搜索
            </span>
            <span>
              <Sparkles size={14} /> 自适应瀑布流
            </span>
          </div>
        </div>

        {recents.length > 0 && (
          <div className="recent-section">
            <div className="recent-heading">
              <span>最近打开</span>
              <span>{recents.length} 个工作区</span>
            </div>
            <div className="recent-grid">
              {recents.map((recent) => (
                <button
                  className="recent-card"
                  key={recent.path}
                  type="button"
                  title={recent.path}
                  onClick={() => onOpenRecent(recent.path)}
                >
                  <span className="recent-icon">
                    <Folder size={18} />
                  </span>
                  <span className="recent-copy">
                    <span className="recent-name">{recent.name}</span>
                    <span className="recent-path">{recent.path}</span>
                  </span>
                  <ArrowUpRight size={15} className="recent-arrow" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
