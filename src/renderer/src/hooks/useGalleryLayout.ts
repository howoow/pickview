import { useMemo } from 'react'
import type { ImageRecord, LayoutMode } from '../../../shared/types'

export interface TilePosition {
  x: number
  y: number
  width: number
  height: number
}

interface GalleryLayout {
  positions: TilePosition[]
  totalHeight: number
  columnCount: number
}

export function useGalleryLayout(
  images: ImageRecord[],
  width: number,
  targetSize: number,
  gap: number,
  mode: LayoutMode
): GalleryLayout {
  return useMemo(() => {
    if (width <= 0 || images.length === 0) {
      return { positions: [], totalHeight: 0, columnCount: 0 }
    }

    const columnCount = Math.max(1, Math.floor((width + gap) / (targetSize + gap)))
    const tileWidth = (width - gap * (columnCount - 1)) / columnCount

    if (mode === 'grid') {
      const positions = images.map((_image, index) => {
        const column = index % columnCount
        const row = Math.floor(index / columnCount)
        return {
          x: column * (tileWidth + gap),
          y: row * (tileWidth + gap),
          width: tileWidth,
          height: tileWidth
        }
      })
      const rowCount = Math.ceil(images.length / columnCount)
      return {
        positions,
        totalHeight: Math.max(0, rowCount * tileWidth + Math.max(0, rowCount - 1) * gap),
        columnCount
      }
    }

    const columnHeights = new Array<number>(columnCount).fill(0)
    const positions = images.map((image) => {
      let column = 0
      for (let index = 1; index < columnCount; index += 1) {
        if (columnHeights[index] < columnHeights[column]) column = index
      }
      const ratio = image.width > 0 && image.height > 0 ? image.height / image.width : 0.75
      const height = Math.max(48, tileWidth * ratio)
      const position = {
        x: column * (tileWidth + gap),
        y: columnHeights[column],
        width: tileWidth,
        height
      }
      columnHeights[column] += height + gap
      return position
    })

    return {
      positions,
      totalHeight: Math.max(0, Math.max(...columnHeights) - gap),
      columnCount
    }
  }, [gap, images, mode, targetSize, width])
}
