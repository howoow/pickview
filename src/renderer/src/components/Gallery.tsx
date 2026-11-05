import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import type { ImageRecord, LayoutMode } from '../../../shared/types'
import { useGalleryLayout } from '../hooks/useGalleryLayout'

interface GalleryProps {
  images: ImageRecord[]
  mode: LayoutMode
  targetSize: number
  gap: number
  showPath: boolean
  heroId: string | null
  resetKey: string
  onOpen: (index: number, previewUrl: string) => void
}

interface PhotoTileProps {
  image: ImageRecord
  index: number
  width: number
  height: number
  x: number
  y: number
  showPath: boolean
  heroId: string | null
  onOpen: (index: number, previewUrl: string) => void
}

function formatDimensions(image: ImageRecord): string {
  return `${image.width} × ${image.height}`
}

function PhotoTile({
  image,
  index,
  width,
  height,
  x,
  y,
  showPath,
  heroId,
  onOpen
}: PhotoTileProps): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const requestedWidth = Math.min(960, Math.max(160, Math.ceil((width * 1.3) / 160) * 160))
  const thumbnailUrl = `pickview://thumb/${encodeURIComponent(image.id)}?w=${requestedWidth}`

  return (
    <button
      className="photo-tile"
      type="button"
      style={{ width, height, transform: `translate3d(${x}px, ${y}px, 0)` }}
      title={`${image.name}\n${formatDimensions(image)}`}
      draggable={false}
      onClick={() => onOpen(index, thumbnailUrl)}
    >
      {!loaded && !failed && <span className="photo-placeholder" aria-hidden="true" />}
      {failed ? (
        <span className="photo-error">
          <ImageOff size={18} />
          <span>无法预览</span>
        </span>
      ) : (
        <>
          {heroId === image.id && (
            <img
              className="photo-image photo-image-base"
              src={thumbnailUrl}
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="async"
              draggable={false}
              onLoad={() => setLoaded(true)}
            />
          )}
          <img
            className={`photo-image${heroId === image.id ? ' is-view-hero' : ''}`}
            src={thumbnailUrl}
            alt={image.name}
            loading="eager"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      )}
      <span className="photo-caption">
        <span className="photo-name">{image.name}</span>
        <span className="photo-meta">{showPath ? image.relativePath : formatDimensions(image)}</span>
      </span>
    </button>
  )
}

export function Gallery({
  images,
  mode,
  targetSize,
  gap,
  showPath,
  heroId,
  resetKey,
  onOpen
}: GalleryProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const [width, setWidth] = useState(0)
  const [viewport, setViewport] = useState({ top: 0, height: 0 })
  const { positions, totalHeight } = useGalleryLayout(images, width, targetSize, gap, mode)

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const updateSize = (contentWidth?: number): void => {
      const styles = getComputedStyle(element)
      const padding =
        Number.parseFloat(styles.paddingLeft || '0') + Number.parseFloat(styles.paddingRight || '0')
      setWidth(contentWidth ?? element.clientWidth - padding)
      setViewport((current) =>
        current.height === element.clientHeight ? current : { ...current, height: element.clientHeight }
      )
    }
    updateSize()
    const observer = new ResizeObserver((entries) => updateSize(entries[0]?.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const updateScroll = (): void => {
      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        setViewport((current) =>
          Math.abs(current.top - element.scrollTop) < 0.5
            ? current
            : { ...current, top: element.scrollTop }
        )
      })
    }
    element.addEventListener('scroll', updateScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', updateScroll)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setViewport((current) => ({ ...current, top: 0 }))
  }, [resetKey])

  const visibleItems = useMemo(() => {
    const buffer = 700
    const top = viewport.top - buffer
    const bottom = viewport.top + viewport.height + buffer
    const result: Array<{ index: number; position: (typeof positions)[number] }> = []
    for (let index = 0; index < positions.length; index += 1) {
      const position = positions[index]
      if (position.y < bottom && position.y + position.height > top) result.push({ index, position })
    }
    return result
  }, [positions, viewport])

  return (
    <div className="gallery-scroll" ref={scrollRef}>
      {images.length === 0 ? (
        <div className="gallery-empty">
          <div className="gallery-empty-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h3>这个文件夹里还没有图片</h3>
          <p>从左侧目录树选择其他文件夹，或打开一个新的工作区。</p>
        </div>
      ) : (
        <div className="gallery-canvas" style={{ height: totalHeight }}>
          {visibleItems.map(({ index, position }) => (
            <PhotoTile
              key={images[index].id}
              image={images[index]}
              index={index}
              width={position.width}
              height={position.height}
              x={position.x}
              y={position.y}
              showPath={showPath}
              heroId={heroId}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}
