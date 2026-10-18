import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from '@mui/material'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { generateKeyBetween } from 'fractional-indexing'
import * as Y from 'yjs'
import { v7 as uuidv7 } from 'uuid'
import { api, type UploadContext } from '../api'
import type {
  ColumnDef,
  Episode,
  MediaAsset,
  MediaKind,
  Sheet,
} from '../types'
import {
  useSheetCollab,
  type CollabRow,
} from '../collab/useSheetCollab'
import {
  cellsOf,
  ensureCells,
  getOrCreateArray,
  readRowMediaLinks,
  readString,
  toMediaItem,
  type MediaItem,
} from '../collab/rowUtils'
import { MediaPicker } from '../components/MediaPicker'
import { MediaViewer } from '../components/MediaViewer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TextCell } from '../components/cells/TextCell'
import { LongTextCell } from '../components/cells/LongTextCell'
import { MarkCell } from '../components/cells/MarkCell'
import { NoteCell, type NoteMediaItem } from '../components/cells/NoteCell'
import { VideoCell } from '../components/cells/VideoCell'
import { SelectedImageCell } from '../components/cells/SelectedImageCell'
import { AlternatesCell } from '../components/cells/AlternatesCell'
import { EpisodesCell } from '../components/cells/EpisodesCell'
import type { OpenMedia, PickMedia } from '../components/cells/types'

const COLUMN_WIDTHS: Record<string, string> = {
  'beat.scene': '140px',
  'beat.beat_no': '64px',
  'beat.story': '320px',
  'beat.mark': '100px',
  'beat.plan': '260px',
  'beat.note': '280px',
  'beat.videos': '320px',
  'asset.category': '140px',
  'asset.name': '190px',
  'asset.episodes': '230px',
  'asset.selected': '190px',
  'asset.alternates': '290px',
  'asset.note': '270px',
}

type PickerState = {
  kind: MediaKind
  onSelect: (asset: MediaAsset) => void
  context?: UploadContext
}

type RowMenuState = {
  x: number
  y: number
  row: CollabRow
}

type ViewerState = {
  asset: MediaAsset
  onSetSelected?: () => void
}

type SortableRowProps = {
  row: CollabRow
  index: number
  columns: ColumnDef[]
  readOnly: boolean
  peerSelections: Map<string, string[]>
  renderCell: (row: CollabRow, column: ColumnDef, index: number) => React.ReactNode
  onContextMenu: (event: React.MouseEvent<HTMLTableRowElement>, row: CollabRow) => void
  setSelection: (rowId: string | null, columnId: string | null) => void
  isDropTarget: boolean
  onDragOverRow: (
    event: React.DragEvent<HTMLTableRowElement>,
    row: CollabRow,
  ) => void
  onDragLeaveRow: (
    event: React.DragEvent<HTMLTableRowElement>,
    row: CollabRow,
  ) => void
  onDropRow: (
    event: React.DragEvent<HTMLTableRowElement>,
    row: CollabRow,
  ) => void
}

function SortableRow({
  row,
  index,
  columns,
  readOnly,
  peerSelections,
  renderCell,
  onContextMenu,
  setSelection,
  isDropTarget,
  onDragOverRow,
  onDragLeaveRow,
  onDropRow,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: readOnly })

  return (
    <tr
      ref={setNodeRef}
      className={`sheet-row ${isDragging ? 'dragging' : ''} ${
        isDropTarget ? 'drop-target' : ''
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      onContextMenu={(event) => onContextMenu(event, row)}
      onDragOver={(event) => onDragOverRow(event, row)}
      onDragLeave={(event) => onDragLeaveRow(event, row)}
      onDrop={(event) => onDropRow(event, row)}
    >
      <td className="drag-cell">
        <button
          type="button"
          className="drag-handle"
          disabled={readOnly}
          title="拖拽排序"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={17} />
        </button>
      </td>
      {columns.map((column) => {
        const key = `${row.id}:${column.id}`
        const colors = peerSelections.get(key) ?? []
        return (
          <td
            key={column.id}
            className={`sheet-cell cell-${column.id.replace('.', '-')}`}
            onFocusCapture={() => setSelection(row.id, column.id)}
            onBlurCapture={() => setSelection(null, null)}
            style={
              colors.length
                ? {
                    boxShadow: `inset 0 0 0 2px ${colors[0]}`,
                  }
                : undefined
            }
          >
            {renderCell(row, column, index)}
          </td>
        )
      })}
    </tr>
  )
}

export function SheetPage() {
  const { projectId, sheetId } = useParams<{
    projectId: string
    sheetId: string
  }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const sheetQuery = useQuery({
    queryKey: ['sheet', sheetId],
    queryFn: () => api.getSheet(sheetId!),
    enabled: Boolean(sheetId),
  })
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  })
  const mediaQuery = useQuery({
    queryKey: ['media', projectId],
    queryFn: () => api.listMedia(projectId!, { limit: 500 }),
    enabled: Boolean(projectId),
  })

  const collab = useSheetCollab(sheetId ?? '')
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CollabRow | null>(null)
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null)
  const [dropRowId, setDropRowId] = useState<string | null>(null)
  const [dropBusy, setDropBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const mediaMap = useMemo(() => {
    const map = new Map<string, MediaAsset>()
    for (const asset of mediaQuery.data?.items ?? []) {
      map.set(asset.id, asset)
    }
    return map
  }, [mediaQuery.data])

  const visibleRows = useMemo(
    () => collab.rows.filter((row) => !row.deleted),
    [collab.rows],
  )

  const peerSelections = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const peer of collab.peers) {
      const rowId = peer.selection?.rowId
      const columnId = peer.selection?.columnId
      if (!rowId || !columnId) continue
      const key = `${rowId}:${columnId}`
      const colors = map.get(key) ?? []
      colors.push(peer.color)
      map.set(key, colors)
    }
    return map
  }, [collab.peers])

  const sheet = sheetQuery.data?.sheet
  const columns = useMemo(
    () =>
      [...(sheetQuery.data?.columns ?? [])].sort(
        (a, b) => a.position - b.position,
      ),
    [sheetQuery.data?.columns],
  )
  const episodes: Episode[] =
    projectQuery.data?.episodes ?? sheetQuery.data?.episodes ?? []
  const sheets: Sheet[] = projectQuery.data?.sheets ?? []

  const openPicker: PickMedia = (kind, onSelect, context) => {
    setPicker({ kind, onSelect, context })
  }

  const openMedia: OpenMedia = (asset, onSetSelected) => {
    setViewer({ asset, onSetSelected })
  }

  function noteMediaItems(row: CollabRow): NoteMediaItem[] {
    return readRowMediaLinks(row.row).map((link) => {
      const asset = mediaMap.get(link.assetId)
      return {
        linkId: link.linkId,
        assetId: link.assetId,
        label: asset?.displayName ?? '已删除媒体',
        asset,
        kind: link.role === 'video' ? 'video' : 'image',
      }
    })
  }

  function setText(row: CollabRow, columnId: string, value: string) {
    const target = ensureCells(row.row)
    row.row.doc?.transact(() => target.set(columnId, value))
  }

  function renderCell(
    row: CollabRow,
    column: ColumnDef,
    index: number,
  ): React.ReactNode {
    const cells = cellsOf(row.row)
    switch (column.dataType) {
      case 'text':
        return (
          <TextCell
            value={readString(cells?.get(column.id))}
            onChange={(value) => setText(row, column.id, value)}
            readOnly={collab.readOnly}
          />
        )
      case 'beat_no':
        return <span className="beat-number">{index + 1}</span>
      case 'long_text':
        return (
          <LongTextCell
            row={row.row}
            columnId={column.id}
            readOnly={collab.readOnly}
          />
        )
      case 'enum_color':
        return (
          <MarkCell
            row={row.row}
            cells={cells}
            readOnly={collab.readOnly}
          />
        )
      case 'note_mentions':
        return (
          <NoteCell
            row={row.row}
            columnId={column.id}
            readOnly={collab.readOnly}
            mediaItems={noteMediaItems(row)}
            onOpenMedia={(asset) => openMedia(asset)}
          />
        )
      case 'media_videos':
        return (
          <VideoCell
            row={row.row}
            cells={cells}
            readOnly={collab.readOnly}
            mediaMap={mediaMap}
            onOpenMedia={openMedia}
            onPickMedia={openPicker}
            sheetId={sheet?.id ?? ''}
            rowId={row.id}
            episodeNumber={sheet?.episodeNumber ?? 1}
            beatNumber={index + 1}
          />
        )
      case 'media_selected':
        return (
          <SelectedImageCell
            row={row.row}
            cells={cells}
            readOnly={collab.readOnly}
            mediaMap={mediaMap}
            onOpenMedia={openMedia}
          />
        )
      case 'media_alternates':
        return (
          <AlternatesCell
            row={row.row}
            cells={cells}
            readOnly={collab.readOnly}
            mediaMap={mediaMap}
            onOpenMedia={openMedia}
            onPickMedia={openPicker}
            sheetId={sheet?.id ?? ''}
            rowId={row.id}
            category={readString(cells?.get('asset.category'))}
            assetName={readString(cells?.get('asset.name'))}
          />
        )
      case 'episode_refs':
        return (
          <EpisodesCell
            row={row.row}
            cells={cells}
            readOnly={collab.readOnly}
            episodes={episodes}
            sheets={sheets}
            onNavigate={(targetSheetId) =>
              navigate(`/projects/${projectId}/sheets/${targetSheetId}`)
            }
          />
        )
      default:
        return null
    }
  }

  function appendDroppedMedia(
    row: CollabRow,
    kind: 'video' | 'image',
    asset: MediaAsset,
  ): boolean {
    if (!sheet) return false
    const target = ensureCells(row.row)
    if (sheet.kind === 'beat') {
      if (kind !== 'video') return false
      const array = getOrCreateArray<MediaItem>(target, 'beat.videos')
      if (
        array
          .toArray()
          .some((item) => toMediaItem(item)?.assetId === asset.id)
      ) {
        return true
      }
      row.row.doc?.transact(() => {
        array.push([{ linkId: uuidv7(), assetId: asset.id }])
      })
      return true
    }

    if (kind !== 'image') return false
    const array = getOrCreateArray<MediaItem>(target, 'asset.alternates')
    if (
      array
        .toArray()
        .some((item) => toMediaItem(item)?.assetId === asset.id)
    ) {
      return true
    }
    row.row.doc?.transact(() => {
      array.push([{ linkId: uuidv7(), assetId: asset.id }])
    })
    return true
  }

  function handleRowDragOver(
    event: React.DragEvent<HTMLTableRowElement>,
    row: CollabRow,
  ) {
    if (collab.readOnly) return
    const types = event.dataTransfer.types
    if (
      !types.includes('Files') &&
      !types.includes('application/x-frame-asset')
    ) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (dropRowId !== row.id) setDropRowId(row.id)
  }

  function handleRowDragLeave(
    event: React.DragEvent<HTMLTableRowElement>,
    row: CollabRow,
  ) {
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    if (dropRowId === row.id) setDropRowId(null)
  }

  async function handleRowDrop(
    event: React.DragEvent<HTMLTableRowElement>,
    row: CollabRow,
  ) {
    event.preventDefault()
    setDropRowId(null)
    if (collab.readOnly || dropBusy || !sheet || !projectId) return

    const assetId = event.dataTransfer.getData('application/x-frame-asset')
    if (assetId) {
      const asset = mediaMap.get(assetId)
      if (!asset) {
        setToast('媒体不存在')
        return
      }
      if (appendDroppedMedia(row, asset.kind, asset)) {
        setToast('已添加到当前行')
      } else {
        setToast(
          sheet.kind === 'beat'
            ? '节拍表只能放视频'
            : '资产表只能放图片',
        )
      }
      return
    }

    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return

    const expectedKind: 'video' | 'image' =
      sheet.kind === 'beat' ? 'video' : 'image'
    const isExpected = (file: File) => {
      if (expectedKind === 'video') {
        return (
          file.type.startsWith('video/') ||
          /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)
        )
      }
      return (
        file.type.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name)
      )
    }
    const valid = files.filter(isExpected)
    if (valid.length === 0) {
      setToast(
        expectedKind === 'video' ? '请拖入视频文件' : '请拖入图片文件',
      )
      return
    }

    const rowIndex = visibleRows.findIndex((item) => item.id === row.id)
    const cells = cellsOf(row.row)
    const category = readString(cells?.get('asset.category'))
    const assetName = readString(cells?.get('asset.name'))
    setDropBusy(true)
    let uploaded = 0
    try {
      for (const file of valid) {
        const asset = await api.uploadMedia(
          projectId,
          expectedKind,
          file,
          sheet.kind === 'beat'
            ? {
                sheetId: sheet.id,
                rowId: row.id,
                columnId: 'beat.videos',
                role: 'video',
                episodeNumber: sheet.episodeNumber ?? 1,
                beatNumber: rowIndex >= 0 ? rowIndex + 1 : 1,
              }
            : {
                sheetId: sheet.id,
                rowId: row.id,
                columnId: 'asset.alternates',
                role: 'alternate',
                category,
                assetName,
              },
        )
        appendDroppedMedia(row, expectedKind, asset)
        uploaded += 1
      }
      await queryClient.invalidateQueries({ queryKey: ['media', projectId] })
      setToast(
        `已上传 ${uploaded} 个${expectedKind === 'video' ? '视频' : '图片'}`,
      )
    } catch (error) {
      setToast(error instanceof Error ? error.message : '上传失败')
    } finally {
      setDropBusy(false)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = visibleRows.findIndex((row) => row.id === active.id)
    const newIndex = visibleRows.findIndex((row) => row.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const finalRows = arrayMove(visibleRows, oldIndex, newIndex)
    const finalIndex = finalRows.findIndex((row) => row.id === active.id)
    if (finalIndex < 0) return
    const previous = finalRows[finalIndex - 1]?.position ?? null
    const next = finalRows[finalIndex + 1]?.position ?? null
    const position = generateKeyBetween(previous, next)
    collab.setRowPosition(String(active.id), position)
  }

  function confirmDeleteRow() {
    if (!pendingDelete) return
    collab.deleteRow(pendingDelete.id)
    setPendingDelete(null)
    setToast('已移入回收站')
  }

  const isLoading =
    sheetQuery.isLoading ||
    projectQuery.isLoading ||
    mediaQuery.isLoading

  if (sheetQuery.error) {
    return (
      <div className="page-error">
        <Typography variant="h5">表不存在或已删除</Typography>
        <Button
          variant="outlined"
          sx={{ mt: 2 }}
          onClick={() => navigate(`/projects/${projectId}`)}
        >
          返回项目
        </Button>
      </div>
    )
  }

  if (isLoading || !sheet) {
    return (
      <div className="page-loading">
        <CircularProgress size={30} />
        <Typography color="text.secondary">载入表内容…</Typography>
      </div>
    )
  }

  const isBeat = sheet.kind === 'beat'
  const tableMinWidth = isBeat ? 1526 : 1322

  return (
    <div className="sheet-page">
      {!collab.synced || collab.status !== 'connected' ? (
        <Alert
          icon={false}
          severity={collab.status === 'disconnected' ? 'warning' : 'info'}
          variant="outlined"
          className="connection-alert"
        >
          {collab.status === 'disconnected'
            ? '与协同服务的连接已断开，正在自动重连。当前内容只读，恢复后继续编辑。'
            : '正在与协同服务同步，当前内容暂为只读。'}
        </Alert>
      ) : null}

      <div className="table-shell">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table
            className={`sheet-table ${isBeat ? 'beat-table' : 'asset-table'}`}
            style={{ minWidth: tableMinWidth }}
          >
            <colgroup>
              <col style={{ width: 42 }} />
              {columns.map((column) => (
                <col
                  key={column.id}
                  style={{ width: COLUMN_WIDTHS[column.id] ?? '180px' }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="drag-cell" />
                {columns.map((column) => (
                  <th key={column.id}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="empty-table-cell"
                  >
                    <div className="table-empty">
                      <Typography variant="body1">
                        还没有内容
                      </Typography>
                      <Button
                        variant="outlined"
                        startIcon={<Plus size={16} />}
                        onClick={() => collab.addRow()}
                        disabled={collab.readOnly}
                      >
                        添加第一行
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <SortableContext
                  items={visibleRows.map((row) => row.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {visibleRows.map((row, index) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      index={index}
                      columns={columns}
                      readOnly={collab.readOnly}
                      peerSelections={peerSelections}
                      renderCell={renderCell}
                      onContextMenu={(event, row) => {
                        event.preventDefault()
                        setRowMenu({
                          x: event.clientX,
                          y: event.clientY,
                          row,
                        })
                      }}
                      setSelection={collab.setSelection}
                      isDropTarget={dropRowId === row.id}
                      onDragOverRow={handleRowDragOver}
                      onDragLeaveRow={handleRowDragLeave}
                      onDropRow={handleRowDrop}
                    />
                  ))}
                </SortableContext>
              )}
              {visibleRows.length > 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="table-add-row-cell"
                  >
                    <button
                      type="button"
                      className="table-add-row"
                      onClick={() => collab.addRow()}
                      disabled={collab.readOnly}
                    >
                      <Plus size={14} /> 添加一行
                    </button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </DndContext>
        {!collab.synced && visibleRows.length === 0 ? (
          <div className="sync-overlay">
            <CircularProgress size={26} />
            <span>正在同步表内容…</span>
          </div>
        ) : null}
      </div>

      <MediaPicker
        open={Boolean(picker)}
        projectId={projectId!}
        kind={picker?.kind ?? 'video'}
        uploadContext={picker?.context}
        onClose={() => setPicker(null)}
        onSelect={(asset) => {
          picker?.onSelect(asset)
          setPicker(null)
        }}
      />

      <MediaViewer
        asset={viewer?.asset ?? null}
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
        onSetSelected={
          viewer?.onSetSelected
            ? () => {
                viewer.onSetSelected?.()
                setViewer(null)
              }
            : undefined
        }
      />

      <Menu
        open={Boolean(rowMenu)}
        onClose={() => setRowMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          rowMenu ? { top: rowMenu.y, left: rowMenu.x } : undefined
        }
      >
        <MenuItem
          sx={{ gap: 1 }}
          onClick={() => {
            if (rowMenu) setPendingDelete(rowMenu.row)
            setRowMenu(null)
          }}
        >
          <Trash2 size={16} color="var(--red)" />
          删除行
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除这一行？"
        description="这一行会进入回收站。行内媒体如果仍被其他行使用会保留；没有其他引用的媒体会一起进入回收站。"
        confirmLabel="删除"
        confirmColor="error"
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDeleteRow}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2200}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}
