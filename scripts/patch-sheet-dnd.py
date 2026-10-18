from pathlib import Path

p = Path('apps/web/src/pages/SheetPage.tsx')
s = p.read_text(encoding='utf-8')

s = s.replace(
    "import { generateKeyBetween } from 'fractional-indexing'\nimport * as Y from 'yjs'",
    "import { generateKeyBetween } from 'fractional-indexing'\nimport * as Y from 'yjs'\nimport { v7 as uuidv7 } from 'uuid'",
)
s = s.replace(
    """import {
  cellsOf,
  ensureCells,
  readRowMediaLinks,
  readString,
} from '../collab/rowUtils'""",
    """import {
  cellsOf,
  ensureCells,
  getOrCreateArray,
  readRowMediaLinks,
  readString,
  toMediaItem,
  type MediaItem,
} from '../collab/rowUtils'""",
)
s = s.replace(
    """  renderCell: (row: CollabRow, column: ColumnDef, index: number) => React.ReactNode
  onContextMenu: (event: React.MouseEvent<HTMLTableRowElement>, row: CollabRow) => void
  setSelection: (rowId: string | null, columnId: string | null) => void
}""",
    """  renderCell: (row: CollabRow, column: ColumnDef, index: number) => React.ReactNode
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
}""",
)
s = s.replace(
    """  renderCell,
  onContextMenu,
  setSelection,
}: SortableRowProps)""",
    """  renderCell,
  onContextMenu,
  setSelection,
  isDropTarget,
  onDragOverRow,
  onDragLeaveRow,
  onDropRow,
}: SortableRowProps)""",
)
s = s.replace(
    """      className={`sheet-row ${isDragging ? 'dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      onContextMenu={(event) => onContextMenu(event, row)}
    >""",
    """      className={`sheet-row ${isDragging ? 'dragging' : ''} ${
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
    >""",
)
s = s.replace(
    """  const [pendingDelete, setPendingDelete] = useState<CollabRow | null>(null)
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null)
  const [toast, setToast] = useState<string | null>(null)""",
    """  const [pendingDelete, setPendingDelete] = useState<CollabRow | null>(null)
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null)
  const [dropRowId, setDropRowId] = useState<string | null>(null)
  const [dropBusy, setDropBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)""",
)

marker = "  function handleDragEnd(event: DragEndEvent) {"
handlers = """  function appendDroppedMedia(
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
          /\\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)
        )
      }
      return (
        file.type.startsWith('image/') ||
        /\\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name)
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

"""
if marker not in s:
    raise SystemExit('handleDragEnd marker not found')
s = s.replace(marker, handlers + marker, 1)
s = s.replace(
    """                      onContextMenu={(event, row) => {
                        event.preventDefault()
                        setRowMenu({
                          x: event.clientX,
                          y: event.clientY,
                          row,
                        })
                      }}
                      setSelection={collab.setSelection}""",
    """                      onContextMenu={(event, row) => {
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
                      onDropRow={handleRowDrop}""",
)
p.write_text(s, encoding='utf-8')
print('added row drag-drop upload')
