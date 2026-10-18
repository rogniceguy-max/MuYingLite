import { useState } from 'react'
import * as Y from 'yjs'
import { v7 as uuidv7 } from 'uuid'
import { Film, Plus, Trash2 } from 'lucide-react'
import { Menu, MenuItem } from '@mui/material'
import {
  ensureCells,
  getArray,
  getOrCreateArray,
  toMediaItem,
  type MediaItem,
} from '../../collab/rowUtils'
import type { MediaAsset } from '../../types'
import { formatBytes } from '../../utils'
import type { OpenMedia, PickMedia } from './types'

type VideoCellProps = {
  row: Y.Map<any>
  cells: Y.Map<any> | null
  readOnly: boolean
  mediaMap: Map<string, MediaAsset>
  onOpenMedia: OpenMedia
  onPickMedia: PickMedia
  sheetId: string
  rowId: string
  episodeNumber: number
  beatNumber: number
}

export function VideoCell({
  row,
  cells,
  readOnly,
  mediaMap,
  onOpenMedia,
  onPickMedia,
  sheetId,
  rowId,
  episodeNumber,
  beatNumber,
}: VideoCellProps) {
  const [menu, setMenu] = useState<{
    x: number
    y: number
    index: number
  } | null>(null)
  const [cellMenu, setCellMenu] = useState<{ x: number; y: number } | null>(
    null,
  )

  const array = cells ? getArray<MediaItem>(cells, 'beat.videos') : null
  const items = (array?.toArray() ?? [])
    .map((item) => toMediaItem(item))
    .filter((item): item is MediaItem => Boolean(item))

  function removeVideo(index: number) {
    const current = cells ? getArray<MediaItem>(cells, 'beat.videos') : null
    if (!current) return
    row.doc?.transact(() => current.delete(index, 1))
  }

  function addExistingVideo(asset: MediaAsset) {
    const target = ensureCells(row)
    const array = getOrCreateArray<MediaItem>(target, 'beat.videos')
    if (
      array
        .toArray()
        .some((item) => toMediaItem(item)?.assetId === asset.id)
    ) {
      return
    }
    row.doc?.transact(() => {
      array.push([{ linkId: uuidv7(), assetId: asset.id }])
    })
  }

  return (
    <div
      className="media-cell"
      onContextMenu={(event) => {
        if (readOnly) return
        event.preventDefault()
        event.stopPropagation()
        setCellMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      {items.map((item, index) => {
        const asset = mediaMap.get(item.assetId)
        return (
          <div
            key={item.linkId}
            className={`video-card ${asset ? '' : 'missing'}`}
            onClick={() => {
              if (asset) onOpenMedia(asset)
            }}
            onContextMenu={(event) => {
              if (readOnly) return
              event.preventDefault()
              event.stopPropagation()
              setMenu({ x: event.clientX, y: event.clientY, index })
            }}
          >
            <div className="video-card-icon">
              <Film size={18} />
            </div>
            <div className="video-card-body">
              <div className="video-card-name" title={asset?.displayName}>
                {asset?.displayName ?? '媒体已删除'}
              </div>
              <div className="video-card-meta">
                {asset
                  ? `${formatBytes(asset.sizeBytes)} · ${
                      asset.status === 'ready' ? '可播放' : asset.status
                    }`
                  : '请移除后重新添加'}
              </div>
            </div>
          </div>
        )
      })}

      <Menu
        open={Boolean(cellMenu)}
        onClose={() => setCellMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          cellMenu ? { top: cellMenu.y, left: cellMenu.x } : undefined
        }
      >
        <MenuItem
          sx={{ gap: 1 }}
          onClick={() => {
            onPickMedia('video', addExistingVideo, {
              sheetId,
              rowId,
              columnId: 'beat.videos',
              role: 'video',
              episodeNumber,
              beatNumber,
            })
            setCellMenu(null)
          }}
        >
          <Plus size={16} />
          从文件库添加
        </MenuItem>
      </Menu>

      <Menu
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        <MenuItem
          sx={{ gap: 1, color: 'error.main' }}
          onClick={() => {
            if (menu) removeVideo(menu.index)
            setMenu(null)
          }}
        >
          <Trash2 size={16} />
          移除
        </MenuItem>
      </Menu>
    </div>
  )
}
