import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FolderSearch,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  X
} from 'lucide-react'
import type { ImageRecord } from '../../../shared/types'

interface ImageViewerProps {
  images: ImageRecord[]
  activeIndex: number
  initialImageId: string | null
  initialPreviewUrl: string | null
  onIndexChange: (index: number) => void
  onClose: () => void
  onReveal: (image: ImageRecord) => void
}

interface Point {
  x: number
  y: number
}

const MIN_ZOOM = 0.35
const MAX_ZOOM = 16

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(timestamp)
}

export function ImageViewer({
  images,
  activeIndex,
  initialImageId,
  initialPreviewUrl,
  onIndexChange,
  onClose,
  onReveal
}: ImageViewerProps): React.JSX.Element | null {
  const image = images[activeIndex]
  const stageRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const panRef = useRef<Point>({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; start: Point; pan: Point } | null>(null)
  const movedRef = useRef(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [useFallback, setUseFallback] = useState(false)

  const setTransform = useCallback((nextZoom: number, nextPan: Point): void => {
    zoomRef.current = nextZoom
    panRef.current = nextPan
    setZoom(nextZoom)
    setPan(nextPan)
  }, [])

  const resetTransform = useCallback((): void => {
    setTransform(1, { x: 0, y: 0 })
  }, [setTransform])

  const zoomAt = useCallback(
    (nextZoom: number, clientX?: number, clientY?: number): void => {
      const clamped = clampZoom(nextZoom)
      const currentZoom = zoomRef.current
      if (Math.abs(clamped - currentZoom) < 0.0001) return
      const stage = stageRef.current
      if (!stage || clientX === undefined || clientY === undefined) {
        setTransform(clamped, panRef.current)
        return
      }
      const rect = stage.getBoundingClientRect()
      const anchorX = clientX - rect.left - rect.width / 2
      const anchorY = clientY - rect.top - rect.height / 2
      const ratio = clamped / currentZoom
      const nextPan = {
        x: anchorX - (anchorX - panRef.current.x) * ratio,
        y: anchorY - (anchorY - panRef.current.y) * ratio
      }
      setTransform(clamped, nextPan)
    },
    [setTransform]
  )

  const goTo = useCallback(
    (direction: number): void => {
      if (images.length < 2) return
      const next = (activeIndex + direction + images.length) % images.length
      onIndexChange(next)
    },
    [activeIndex, images.length, onIndexChange]
  )

  useEffect(() => {
    setLoaded(false)
    setPreviewLoaded(false)
    setFailed(false)
    setUseFallback(!image?.browserReadable)
    setTransform(1, { x: 0, y: 0 })
  }, [image?.id, image?.browserReadable, setTransform])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goTo(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goTo(1)
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomAt(zoomRef.current * 1.35)
      } else if (event.key === '-') {
        event.preventDefault()
        zoomAt(zoomRef.current / 1.35)
      } else if (event.key === '0') {
        event.preventDefault()
        resetTransform()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [goTo, onClose, resetTransform, zoomAt])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0018)
      zoomAt(zoomRef.current * factor, event.clientX, event.clientY)
    }
    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [zoomAt])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  if (!image) return null

  const source = useFallback
    ? `pickview://preview/${encodeURIComponent(image.id)}`
    : `pickview://original/${encodeURIComponent(image.id)}`
  const previewSource =
    image.id === initialImageId && initialPreviewUrl
      ? initialPreviewUrl
      : `pickview://thumb/${encodeURIComponent(image.id)}?w=480`
  const photoStyle = {
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
    '--photo-aspect': image.width > 0 && image.height > 0 ? String(image.width / image.height) : '1.5'
  } as CSSProperties

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || zoomRef.current <= 1.05) return
    event.preventDefault()
    event.stopPropagation()
    movedRef.current = false
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      pan: { ...panRef.current }
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.start.x
    const dy = event.clientY - drag.start.y
    if (Math.abs(dx) + Math.abs(dy) > 2) movedRef.current = true
    const nextPan = { x: drag.pan.x + dx, y: drag.pan.y + dy }
    setTransform(zoomRef.current, nextPan)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`查看 ${image.name}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="viewer-header">
        <div className="viewer-file">
          <span className="viewer-filename">{image.name}</span>
          <span className="viewer-detail">
            {image.width} × {image.height} · {formatBytes(image.size)} · {formatDate(image.modifiedAt)}
          </span>
        </div>
        <div className="viewer-actions">
          <span className="viewer-counter">
            {activeIndex + 1} / {images.length}
          </span>
          <button
            className="viewer-icon-button"
            type="button"
            title="在访达中显示"
            aria-label="在访达中显示"
            onClick={() => onReveal(image)}
          >
            <FolderSearch size={18} />
          </button>
          <button
            className="viewer-icon-button"
            type="button"
            title="关闭 (Esc)"
            aria-label="关闭查看器"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
      </div>

      <div
        className="viewer-stage"
        ref={stageRef}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        {!previewLoaded && !loaded && !failed && (
          <div className="viewer-loading">
            <LoaderCircle size={22} className="spin" />
            <span>正在载入…</span>
          </div>
        )}
        {failed ? (
          <div className="viewer-loading">
            <span>这张图片暂时无法预览</span>
          </div>
        ) : (
          <div
            className={`viewer-photo${dragging ? ' is-dragging' : ''}`}
            style={photoStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={(event) => {
              if (zoomRef.current > 1.05) resetTransform()
              else zoomAt(2.5, event.clientX, event.clientY)
            }}
          >
            <img
              key={`preview:${image.id}:${previewSource}`}
              className="viewer-image viewer-image-preview"
              src={previewSource}
              alt=""
              aria-hidden="true"
              width={image.width}
              height={image.height}
              draggable={false}
              style={{ opacity: previewLoaded ? 1 : 0 }}
              onLoad={() => setPreviewLoaded(true)}
            />
            <img
              key={`full:${image.id}:${source}`}
              className="viewer-image viewer-image-full"
              src={source}
              alt={image.name}
              draggable={false}
              style={{ opacity: loaded ? 1 : 0 }}
              onLoad={() => setLoaded(true)}
              onError={() => {
                if (!useFallback) {
                  setLoaded(false)
                  setUseFallback(true)
                } else if (!previewLoaded) {
                  setFailed(true)
                }
              }}
            />
          </div>
        )}

        {images.length > 1 && (
          <>
            <button
              className="viewer-nav viewer-nav-previous"
              type="button"
              aria-label="上一张"
              onClick={() => goTo(-1)}
            >
              <ChevronLeft size={24} />
            </button>
            <button
              className="viewer-nav viewer-nav-next"
              type="button"
              aria-label="下一张"
              onClick={() => goTo(1)}
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      <div className="viewer-footer">
        <div className="viewer-zoom">
          <button
            type="button"
            aria-label="缩小"
            onClick={() => zoomAt(zoomRef.current / 1.35)}
          >
            <Minus size={15} />
          </button>
          <button className="viewer-zoom-value" type="button" title="重置为适应窗口" onClick={resetTransform}>
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="放大"
            onClick={() => zoomAt(zoomRef.current * 1.35)}
          >
            <Plus size={15} />
          </button>
          <span className="viewer-zoom-divider" />
          <button type="button" aria-label="适应窗口" title="适应窗口 (0)" onClick={resetTransform}>
            <RotateCcw size={14} />
          </button>
        </div>
        <span className="viewer-hint">滚轮缩放 · 拖动画面 · Esc 关闭</span>
      </div>
    </div>
  )
}
