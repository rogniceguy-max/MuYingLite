import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from '@mui/material'
import {
  ArrowUp,
  ChevronRight,
  Film,
  Folder,
  Image as ImageIcon,
  RotateCcw,
  Table2,
  Trash2,
} from 'lucide-react'
import { api } from '../api'
import type {
  MediaAsset,
  RecycleBatch,
  RecycleReferencedMedia,
} from '../types'
import { formatBytes, formatDate } from '../utils'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MediaViewer } from '../components/MediaViewer'

type KindFilter = 'all' | RecycleBatch['kind']

type RecycleFolderNode = {
  name: string
  segments: string[]
  folders: Map<string, RecycleFolderNode>
  files: RecycleReferencedMedia[]
}

const KIND_LABEL: Record<RecycleBatch['kind'], string> = {
  row: '行',
  sheet: '整集',
  media: '媒体',
}

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'row', label: '行' },
  { value: 'sheet', label: '整集' },
  { value: 'media', label: '媒体' },
]

function episodeLabel(batch: RecycleBatch): string | null {
  if (batch.metadata.episodeNumber == null) return null
  return `第${batch.metadata.episodeNumber}集${
    batch.metadata.episodeTitle ? ` · ${batch.metadata.episodeTitle}` : ''
  }`
}

function batchTitle(batch: RecycleBatch): string {
  if (batch.kind === 'row') {
    return `${episodeLabel(batch) ?? '资产表'} · ${
      batch.metadata.rowSummary ?? '一行'
    }`
  }
  if (batch.kind === 'sheet') {
    return episodeLabel(batch) ?? '节拍表'
  }
  return (
    batch.metadata.fileName ??
    batch.media[0]?.displayName ??
    '一个媒体文件'
  )
}

function batchThumb(batch: RecycleBatch) {
  if (batch.kind === 'sheet') {
    return <Folder size={58} strokeWidth={1.25} />
  }
  if (batch.kind === 'row') {
    return <Table2 size={44} strokeWidth={1.4} />
  }

  const preview =
    batch.media.find((media) => media.kind === 'image' && media.thumbnailUrl) ??
    batch.media[0]

  if (preview?.kind === 'image' && preview.thumbnailUrl) {
    return <img src={preview.thumbnailUrl} alt={preview.displayName} />
  }
  if (preview?.kind === 'video') {
    return <Film size={44} strokeWidth={1.4} />
  }
  return <ImageIcon size={44} strokeWidth={1.4} />
}

function referencedMediaFor(batch: RecycleBatch): RecycleReferencedMedia[] {
  if (batch.referencedMedia?.length) return batch.referencedMedia
  return batch.media.map((media) => ({
    ...media,
    mimeType: '',
    sizeBytes: 0,
    width: null,
    height: null,
    durationMs: null,
    status: 'ready' as const,
    processingError: null,
    createdAt: batch.createdAt,
    folderPath: undefined,
    deleted: true,
    deletedInBatch: true,
    shared: false,
    usageCount: 0,
  }))
}

function sharedMediaCount(batch: RecycleBatch): number {
  return referencedMediaFor(batch).filter((media) => media.shared).length
}

function folderSegments(media: RecycleReferencedMedia): string[] {
  return (media.folderPath ?? '文件库').split(' / ')
}

function buildBatchFolderTree(batch: RecycleBatch): {
  root: RecycleFolderNode
  rootPrefix: string[]
} {
  const referenced = referencedMediaFor(batch)
  const root: RecycleFolderNode = {
    name: '',
    segments: [],
    folders: new Map(),
    files: [],
  }
  if (referenced.length === 0) {
    return { root, rootPrefix: [] }
  }

  const segmentLists = referenced.map(folderSegments)
  let common = [...segmentLists[0]]
  for (const segments of segmentLists.slice(1)) {
    let index = 0
    while (
      index < common.length &&
      index < segments.length &&
      common[index] === segments[index]
    ) {
      index += 1
    }
    common = common.slice(0, index)
  }
  const expectedEpisodeFolder =
    batch.metadata.episodeNumber != null
      ? `第${batch.metadata.episodeNumber}集`
      : null
  const rootPrefix =
    batch.kind === 'sheet' &&
    common.length > 0 &&
    common[0] === expectedEpisodeFolder
      ? [common[0]]
      : []

  for (const media of referenced) {
    let segments = folderSegments(media)
    if (rootPrefix.length > 0 && segments[0] === rootPrefix[0]) {
      segments = segments.slice(1)
    }
    let node = root
    for (const segment of segments) {
      let child = node.folders.get(segment)
      if (!child) {
        child = {
          name: segment,
          segments: [...node.segments, segment],
          folders: new Map(),
          files: [],
        }
        node.folders.set(segment, child)
      }
      node = child
    }
    node.files.push(media)
  }

  return { root, rootPrefix }
}

function findFolderNode(
  root: RecycleFolderNode,
  segments: string[],
): RecycleFolderNode | null {
  let node = root
  for (const segment of segments) {
    const child = node.folders.get(segment)
    if (!child) return null
    node = child
  }
  return node
}

function sortedFolderNodes(node: RecycleFolderNode): RecycleFolderNode[] {
  return Array.from(node.folders.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
  )
}

function countFolderFiles(node: RecycleFolderNode): number {
  let count = node.files.length
  for (const child of node.folders.values()) {
    count += countFolderFiles(child)
  }
  return count
}

function recycleMediaAsset(
  media: RecycleReferencedMedia,
  projectId: string,
): MediaAsset {
  return {
    id: media.assetId,
    projectId,
    kind: media.kind,
    displayName: media.displayName,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
    status: media.status,
    processingError: media.processingError,
    thumbnailUrl: media.thumbnailUrl,
    originalUrl: media.originalUrl,
    createdAt: media.createdAt,
    deletedAt: media.deleted ? media.createdAt : null,
    folderPath: media.folderPath,
  }
}

export function RecycleBinPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openBatch, setOpenBatch] = useState<RecycleBatch | null>(null)
  const [batchPath, setBatchPath] = useState<string[]>([])
  const [viewerMedia, setViewerMedia] =
    useState<RecycleReferencedMedia | null>(null)
  const [cardMenu, setCardMenu] = useState<{
    x: number
    y: number
    batch: RecycleBatch
  } | null>(null)
  const [purgeTarget, setPurgeTarget] = useState<RecycleBatch | null>(null)
  const [emptyOpen, setEmptyOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const recycleQuery = useQuery({
    queryKey: ['recycle', projectId],
    queryFn: () => api.listRecycleBin(projectId!),
    enabled: Boolean(projectId),
  })

  const batches = recycleQuery.data?.batches ?? []
  const visibleBatches =
    kindFilter === 'all'
      ? batches
      : batches.filter((batch) => batch.kind === kindFilter)
  const purgeSharedCount = purgeTarget ? sharedMediaCount(purgeTarget) : 0

  const batchFolderData = useMemo(
    () => (openBatch ? buildBatchFolderTree(openBatch) : null),
    [openBatch],
  )
  const batchNode = batchFolderData
    ? findFolderNode(batchFolderData.root, batchPath) ??
      batchFolderData.root
    : null
  const batchFolders = batchNode ? sortedFolderNodes(batchNode) : []
  const batchFiles = batchNode
    ? [...batchNode.files].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'zh-CN', {
          numeric: true,
        }),
      )
    : []

  async function invalidateAll() {
    await queryClient.invalidateQueries({ queryKey: ['recycle', projectId] })
    await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    await queryClient.invalidateQueries({ queryKey: ['media', projectId] })
  }

  async function restore(batch: RecycleBatch) {
    setBusy(true)
    try {
      await api.restoreBatch(projectId!, batch.id)
      await invalidateAll()
      setSelectedId((current) => (current === batch.id ? null : current))
      if (openBatch?.id === batch.id) {
        setOpenBatch(null)
        setBatchPath([])
      }
      setToast('已恢复')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '恢复失败')
    } finally {
      setBusy(false)
    }
  }

  async function purge() {
    if (!purgeTarget) return
    setBusy(true)
    try {
      await api.purgeBatch(projectId!, purgeTarget.id)
      await invalidateAll()
      setSelectedId((current) =>
        current === purgeTarget.id ? null : current,
      )
      if (openBatch?.id === purgeTarget.id) {
        setOpenBatch(null)
        setBatchPath([])
      }
      setViewerMedia(null)
      setPurgeTarget(null)
      setToast('已彻底删除')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '彻底删除失败')
    } finally {
      setBusy(false)
    }
  }

  async function emptyAll() {
    setBusy(true)
    try {
      await api.purgeAll(projectId!)
      await invalidateAll()
      setSelectedId(null)
      setOpenBatch(null)
      setBatchPath([])
      setViewerMedia(null)
      setEmptyOpen(false)
      setToast('回收站已清空')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '清空失败')
    } finally {
      setBusy(false)
    }
  }

  function openBatchFolder(batch: RecycleBatch) {
    setSelectedId(batch.id)
    setOpenBatch(batch)
    setBatchPath([])
  }

  function openBatchMenu(
    event: React.MouseEvent,
    batch: RecycleBatch,
  ) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(batch.id)
    setCardMenu({
      x: event.clientX,
      y: event.clientY,
      batch,
    })
  }

  function renderMediaCard(media: RecycleReferencedMedia) {
    return (
      <div
        key={media.assetId}
        role="button"
        tabIndex={0}
        className="file-card recycle-media-card"
        onDoubleClick={() => setViewerMedia(media)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setViewerMedia(media)
        }}
        onContextMenu={(event) => {
          if (openBatch) openBatchMenu(event, openBatch)
        }}
        title="双击预览 · 右键批次操作"
      >
        <div className="file-card-thumb">
          {media.kind === 'image' && media.thumbnailUrl ? (
            <img src={media.thumbnailUrl} alt={media.displayName} />
          ) : media.kind === 'video' ? (
            <Film size={44} strokeWidth={1.4} />
          ) : (
            <ImageIcon size={44} strokeWidth={1.4} />
          )}
          {media.shared ? (
            <span className="status-badge status-ready">仍在使用</span>
          ) : null}
        </div>
        <div className="file-card-name" title={media.displayName}>
          {media.displayName}
        </div>
        <div className="file-card-meta">
          {media.kind === 'video' ? '视频' : '图片'} ·{' '}
          {formatBytes(media.sizeBytes)}
        </div>
      </div>
    )
  }

  return (
    <div className="recycle-page">
      <div className="file-manager">
        <section className="file-contents">
          {openBatch ? (
            <div className="file-toolbar">
              <IconButton
                size="small"
                disabled={busy}
                onClick={() => {
                  if (batchPath.length > 0) {
                    setBatchPath(batchPath.slice(0, batchPath.length - 1))
                  } else {
                    setOpenBatch(null)
                    setBatchPath([])
                  }
                }}
                title="上一级"
              >
                <ArrowUp size={16} />
              </IconButton>
              <div className="file-breadcrumb">
                <button
                  type="button"
                  onClick={() => {
                    setOpenBatch(null)
                    setBatchPath([])
                  }}
                >
                  回收站
                </button>
                <span className="file-breadcrumb-part">
                  <ChevronRight size={13} />
                  <button
                    type="button"
                    onClick={() => setBatchPath([])}
                  >
                    {batchTitle(openBatch)}
                  </button>
                </span>
                {batchPath.map((segment, index) => (
                  <span
                    key={`${segment}-${index}`}
                    className="file-breadcrumb-part"
                  >
                    <ChevronRight size={13} />
                    <button
                      type="button"
                      onClick={() =>
                        setBatchPath(batchPath.slice(0, index + 1))
                      }
                    >
                      {segment}
                    </button>
                  </span>
                ))}
              </div>
              <div className="file-toolbar-spacer" />
              <span className="recycle-count">
                {batchFolders.length + batchFiles.length} 项
              </span>
            </div>
          ) : (
            <div className="file-toolbar">
              <div className="file-breadcrumb">
                <span>回收站</span>
              </div>
              <div className="file-toolbar-spacer" />
              <div className="filter-pills">
                {KIND_FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.value}
                    className={`filter-pill ${
                      kindFilter === filter.value ? 'active' : ''
                    }`}
                    onClick={() => {
                      setKindFilter(filter.value)
                      setSelectedId(null)
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <span className="recycle-count">
                {visibleBatches.length} 个批次
              </span>
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<Trash2 size={15} />}
                onClick={() => setEmptyOpen(true)}
                disabled={busy || batches.length === 0}
              >
                清空回收站
              </Button>
            </div>
          )}

          <div className="file-grid">
            {openBatch ? (
              <>
                {batchFolders.map((folder) => (
                  <button
                    type="button"
                    key={folder.segments.join('/')}
                    className="file-card folder-card"
                    onDoubleClick={() => setBatchPath(folder.segments)}
                    onContextMenu={(event) =>
                      openBatchMenu(event, openBatch)
                    }
                    title="双击打开文件夹 · 右键批次操作"
                  >
                    <div className="file-card-thumb is-folder">
                      <Folder size={58} strokeWidth={1.25} />
                    </div>
                    <div className="file-card-name">{folder.name}</div>
                    <div className="file-card-meta">
                      文件夹 · {countFolderFiles(folder)} 个文件
                    </div>
                  </button>
                ))}
                {batchFiles.map(renderMediaCard)}
                {batchFolders.length === 0 && batchFiles.length === 0 ? (
                  <div className="library-empty file-empty">
                    <Folder size={48} color="var(--muted-2)" strokeWidth={1.2} />
                    <Typography variant="h2">这个文件夹没有内容</Typography>
                  </div>
                ) : null}
              </>
            ) : recycleQuery.isLoading ? (
              <div className="page-loading file-grid-empty">
                <CircularProgress size={26} />
                <Typography color="text.secondary">载入回收站…</Typography>
              </div>
            ) : visibleBatches.length === 0 ? (
              <div className="library-empty file-empty">
                <RotateCcw size={48} color="var(--muted-2)" strokeWidth={1.2} />
                <Typography variant="h2">
                  {batches.length === 0 ? '回收站是空的' : '这个分类没有内容'}
                </Typography>
              </div>
            ) : (
              visibleBatches.map((batch) => {
                const counts = batch.metadata.itemCounts ?? {}
                const referenced = referencedMediaFor(batch)
                const sharedCount = sharedMediaCount(batch)
                const preview = batch.media[0]
                const thumbKind =
                  batch.kind === 'sheet'
                    ? 'is-folder'
                    : batch.kind === 'row'
                      ? 'is-kind'
                      : preview?.kind === 'video'
                        ? 'is-video'
                        : 'is-image'
                const metaParts = [KIND_LABEL[batch.kind]]
                if (batch.kind === 'sheet') {
                  metaParts.push(`${counts.rows || 0} 行`)
                }
                metaParts.push(`${referenced.length} 个媒体`)
                if (sharedCount > 0) {
                  metaParts.push(`${sharedCount} 个仍在使用`)
                }
                return (
                  <div
                    key={batch.id}
                    role="button"
                    tabIndex={0}
                    className={`file-card recycle-batch-card ${
                      selectedId === batch.id ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedId(batch.id)}
                    onDoubleClick={() => {
                      if (batch.kind === 'media' && referenced.length === 1) {
                        setViewerMedia(referenced[0])
                      } else {
                        openBatchFolder(batch)
                      }
                    }}
                    onContextMenu={(event) => openBatchMenu(event, batch)}
                    title="右键恢复或彻底删除 · 双击查看内容"
                  >
                    <div className={`file-card-thumb ${thumbKind}`}>
                      {batchThumb(batch)}
                      {referenced.length > 1 ? (
                        <span className="file-card-count">
                          {referenced.length}
                        </span>
                      ) : null}
                      {batch.restoreBlockedReason ? (
                        <span className="status-badge status-failed">
                          不可恢复
                        </span>
                      ) : null}
                    </div>
                    <div className="file-card-name" title={batchTitle(batch)}>
                      {batchTitle(batch)}
                    </div>
                    <div className="file-card-meta">
                      {metaParts.join(' · ')}
                    </div>
                    <div className="file-card-meta">
                      删除于 {formatDate(batch.createdAt)}
                    </div>
                    {batch.restoreBlockedReason ? (
                      <div
                        className="recycle-card-blocked"
                        title={batch.restoreBlockedReason}
                      >
                        {batch.restoreBlockedReason}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>

      <Menu
        open={Boolean(cardMenu)}
        onClose={() => setCardMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          cardMenu ? { top: cardMenu.y, left: cardMenu.x } : undefined
        }
      >
        <MenuItem
          sx={{ gap: 1 }}
          disabled={busy || !cardMenu?.batch.canRestore}
          onClick={() => {
            const batch = cardMenu?.batch
            setCardMenu(null)
            if (batch) void restore(batch)
          }}
        >
          <RotateCcw size={16} />
          恢复
        </MenuItem>
        <MenuItem
          sx={{ gap: 1, color: 'error.main' }}
          onClick={() => {
            if (cardMenu) setPurgeTarget(cardMenu.batch)
            setCardMenu(null)
          }}
        >
          <Trash2 size={16} />
          彻底删除
        </MenuItem>
      </Menu>

      <MediaViewer
        asset={
          viewerMedia && projectId
            ? recycleMediaAsset(viewerMedia, projectId)
            : null
        }
        open={Boolean(viewerMedia)}
        onClose={() => setViewerMedia(null)}
      />

      <ConfirmDialog
        open={Boolean(purgeTarget)}
        title="彻底删除这一批？"
        description={
          <>
            <p>
              {purgeTarget ? batchTitle(purgeTarget) : ''}{' '}
              将被永久删除：本批次的行/表记录、引用，以及本批次内已删除的媒体原文件。此操作不可恢复。
            </p>
            {purgeSharedCount > 0 ? (
              <p>
                其中 {purgeSharedCount} 个媒体仍被其他表引用，只会删除本批次
                引用，不会删除这些媒体本体。
              </p>
            ) : null}
          </>
        }
        confirmLabel="彻底删除"
        confirmColor="error"
        busy={busy}
        onClose={() => setPurgeTarget(null)}
        onConfirm={() => void purge()}
      />

      <ConfirmDialog
        open={emptyOpen}
        title="清空回收站？"
        description="回收站里的所有行、整集和媒体都会被永久删除，包括媒体原文件。仍被其他表引用的媒体只删除本批次引用，不删除本体。此操作不可恢复。"
        confirmLabel="清空回收站"
        confirmColor="error"
        requireText="DELETE"
        busy={busy}
        onClose={() => setEmptyOpen(false)}
        onConfirm={() => void emptyAll()}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2400}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}
