import { useState } from 'react'
import * as Y from 'yjs'
import { v7 as uuidv7 } from 'uuid'
import { Plus, Trash2 } from 'lucide-react'
import { Menu, MenuItem } from '@mui/material'
import {
  ensureCells,
  getArray,
  getOrCreateArray,
  readSelected,
  toMediaItem,
  type MediaItem,
} from '../../collab/rowUtils'
import type { MediaAsset } from '../../types'
import type { OpenMedia, PickMedia } from './types'

type AlternatesCellProps = {
  row: Y.Map<any>
  cells: Y.Map<any> | null
  readOnly: boolean
  mediaMap: Map<string, MediaAsset>
  onOpenMedia: OpenMedia
  onPickMedia: PickMedia
  sheetId: string
  rowId: string
  category: string
  assetName: string
}

export function AlternatesCell({
  row,
  cells,
  readOnly,
  mediaMap,
  onOpenMedia,
  onPickMedia,
  sheetId,
  rowId,
  category,
  assetName,
}: AlternatesCellProps) {
  const [menu, setMenu] = useState<{
    x: number
    y: number
    linkId: string
  } | null>(null)
  const [cellMenu, setCellMenu] = useState<{ x: number; y: number } | null>(
    null,
  )

  const array = cells ? getArray<MediaItem>(cells, 'asset.alternates') : null
  const items = (array?.toArray() ?? [])
    .map((item) => toMediaItem(item))
    .filter((item): item is MediaItem => Boolean(item))

  function removeAlternate(linkId: string) {
    const current = cells ? getArray<MediaItem>(cells, 'asset.alternates') : null
    if (!current) return
    const list = current
      .toArray()
      .map((item) => toMediaItem(item))
      .filter((item): item is MediaItem => Boolean(item))
    const index = list.findIndex((item) => item.linkId === linkId)
    if (index < 0) return
    row.doc?.transact(() => current.delete(index, 1))
  }

  function addExistingAlternate(asset: MediaAsset) {
    const target = ensureCells(row)
    const alternates = getOrCreateArray<MediaItem>(target, 'asset.alternates')
    const selected = readSelected(target)
    if (selected?.assetId === asset.id) return
    if (
      alternates
        .toArray()
        .map((item) => toMediaItem(item))
        .some((item) => item?.assetId === asset.id)
    ) {
      return
    }
    row.doc?.transact(() => {
      alternates.push([{ linkId: uuidv7(), assetId: asset.id }])
    })
  }

  function setAsSelected(linkId: string) {
    const target = ensureCells(row)
    row.doc?.transact(() => {
      const alternates = getOrCreateArray<MediaItem>(
        target,
        'asset.alternates',
      )
      const currentItems = alternates
        .toArray()
        .map((item) => toMediaItem(item))
        .filter((item): item is MediaItem => Boolean(item))
      const index = currentItems.findIndex((item) => item.linkId === linkId)
      if (index < 0) return

      const chosen = currentItems[index]
      const oldSelected = readSelected(target)
      alternates.delete(index, 1)

      if (oldSelected && oldSelected.assetId !== chosen.assetId) {
        const alreadyAlternate = alternates
          .toArray()
          .map((item) => toMediaItem(item))
          .some((item) => item?.assetId === oldSelected.assetId)
        if (!alreadyAlternate) alternates.push([oldSelected])
      }

      target.set('asset.selected', chosen)
    })
  }

  return (
    <div
      className="alternates-cell"
      onContextMenu={(event) => {
        if (readOnly) return
        event.preventDefault()
        event.stopPropagation()
        setCellMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      <div className="alternates-grid">
        {items.map((item) => {
          const asset = mediaMap.get(item.assetId)
          return (
            <div
              className="alternate-item"
              key={item.linkId}
              onContextMenu={(event) => {
                if (readOnly) return
                event.preventDefault()
                event.stopPropagation()
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  linkId: item.linkId,
                })
              }}
            >
              {asset ? (
                <button
                  type="button"
                  className="image-thumb alternate-thumb"
                  onClick={() =>
                    onOpenMedia(asset, () => setAsSelected(item.linkId))
                  }
                  title={`${asset.displayName} · 点击预览，右键移除`}
                >
                  <img
                    src={asset.thumbnailUrl ?? asset.originalUrl ?? ''}
                    alt={asset.displayName}
                  />
                </button>
              ) : (
                <div className="image-thumb alternate-thumb missing">已删除</div>
              )}
            </div>
          )
        })}
      </div>

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
            onPickMedia('image', addExistingAlternate, {
              sheetId,
              rowId,
              columnId: 'asset.alternates',
              role: 'alternate',
              category,
              assetName,
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
            if (menu) removeAlternate(menu.linkId)
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
