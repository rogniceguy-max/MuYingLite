import { useState } from 'react'
import * as Y from 'yjs'
import { v7 as uuidv7 } from 'uuid'
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material'
import {
  ensureCells,
  getArray,
  getOrCreateArray,
  readSelected,
  toMediaItem,
  type MediaItem,
} from '../../collab/rowUtils'
import type { MediaAsset } from '../../types'
import type { OpenMedia } from './types'

type SelectedImageCellProps = {
  row: Y.Map<any>
  cells: Y.Map<any> | null
  readOnly: boolean
  mediaMap: Map<string, MediaAsset>
  onOpenMedia: OpenMedia
}

type AlternateEntry = {
  item: MediaItem
  asset: MediaAsset
}

export function SelectedImageCell({
  row,
  cells,
  readOnly,
  mediaMap,
  onOpenMedia,
}: SelectedImageCellProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [chooserOpen, setChooserOpen] = useState(false)

  const selected = cells ? readSelected(cells) : null
  const asset = selected ? mediaMap.get(selected.assetId) : undefined

  const alternates: AlternateEntry[] = (
    cells ? getArray<MediaItem>(cells, 'asset.alternates')?.toArray() ?? [] : []
  )
    .map((item) => toMediaItem(item))
    .filter((item): item is MediaItem => Boolean(item))
    .map((item) => ({ item, asset: mediaMap.get(item.assetId) }))
    .filter((entry): entry is AlternateEntry => Boolean(entry.asset))

  function setSelected(nextAsset: MediaAsset) {
    const target = ensureCells(row)
    row.doc?.transact(() => {
      const oldSelected = readSelected(target)
      const alternates = getOrCreateArray<MediaItem>(
        target,
        'asset.alternates',
      )
      let nextLinkId = uuidv7()

      for (let index = alternates.length - 1; index >= 0; index -= 1) {
        const item = toMediaItem(alternates.get(index))
        if (item?.assetId === nextAsset.id) {
          nextLinkId = item.linkId
          alternates.delete(index, 1)
        }
      }

      if (oldSelected && oldSelected.assetId !== nextAsset.id) {
        const alreadyAlternate = alternates
          .toArray()
          .map((item) => toMediaItem(item))
          .some((item) => item?.assetId === oldSelected.assetId)
        if (!alreadyAlternate) alternates.push([oldSelected])
      }

      target.set('asset.selected', {
        linkId: nextLinkId,
        assetId: nextAsset.id,
      })
    })
  }

  function moveSelectedToAlternates() {
    const target = ensureCells(row)
    row.doc?.transact(() => {
      const current = readSelected(target)
      if (!current) return
      if (mediaMap.has(current.assetId)) {
        const alternates = getOrCreateArray<MediaItem>(
          target,
          'asset.alternates',
        )
        const exists = alternates
          .toArray()
          .map((item) => toMediaItem(item))
          .some((item) => item?.assetId === current.assetId)
        if (!exists) alternates.push([current])
      }
      target.set('asset.selected', null)
    })
  }

  return (
    <div
      className="selected-image-cell"
      onContextMenu={(event) => {
        if (readOnly || !selected) return
        event.preventDefault()
        event.stopPropagation()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      {asset ? (
        <button
          type="button"
          className="image-thumb selected-thumb"
          onClick={() => onOpenMedia(asset)}
          title={`${asset.displayName} · 右键更换或移到备选`}
        >
          <img
            src={asset.thumbnailUrl ?? asset.originalUrl ?? ''}
            alt={asset.displayName}
          />
        </button>
      ) : selected ? (
        <div className="image-empty danger">媒体已删除</div>
      ) : null}
      {!readOnly && !asset ? (
        <div className="image-cell-actions">
          <button
            type="button"
            onClick={() => setChooserOpen(true)}
            title={
              alternates.length
                ? '从本行备选图片中选择'
                : '本行还没有备选图片'
            }
          >
            选择图片
          </button>
        </div>
      ) : null}

      <Dialog
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1 }}>从本行备选选择</Box>
          <IconButton size="small" onClick={() => setChooserOpen(false)}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {alternates.length === 0 ? (
            <div className="selected-picker-empty">
              <Typography color="text.secondary">
                当前行还没有备选图片。
              </Typography>
              <Typography variant="caption" color="text.secondary">
                请先在备选列添加图片，再设为选定。
              </Typography>
            </div>
          ) : (
            <div className="media-picker-grid selected-picker-grid">
              {alternates.map(({ item, asset: alternate }) => {
                const active = selected?.assetId === alternate.id
                return (
                  <button
                    type="button"
                    key={item.linkId}
                    className={`media-picker-card selected-picker-card ${
                      active ? 'active' : ''
                    }`}
                    onClick={() => {
                      setSelected(alternate)
                      setChooserOpen(false)
                    }}
                    title={alternate.displayName}
                  >
                    <div className="media-picker-thumb">
                      <img
                        src={
                          alternate.thumbnailUrl ??
                          alternate.originalUrl ??
                          ''
                        }
                        alt={alternate.displayName}
                      />
                      {active ? (
                        <span className="selected-picker-check">
                          <Check size={14} />
                        </span>
                      ) : null}
                    </div>
                    <div className="media-picker-name">
                      {alternate.displayName}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Menu
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        <MenuItem
          sx={{ gap: 1 }}
          onClick={() => {
            setMenu(null)
            setChooserOpen(true)
          }}
        >
          <RefreshCw size={16} />
          更换
        </MenuItem>
        <MenuItem
          sx={{ gap: 1 }}
          onClick={() => {
            moveSelectedToAlternates()
            setMenu(null)
          }}
        >
          <ArrowRight size={16} />
          移到备选
        </MenuItem>
      </Menu>
    </div>
  )
}
