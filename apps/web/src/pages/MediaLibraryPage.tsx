import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from '@mui/material'
import {
  ArrowUp,
  ChevronRight,
  Download,
  Film,
  Folder,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { api, ApiError } from '../api'
import type { ArchiveJob, LinkedRow, MediaAsset } from '../types'
import { formatBytes } from '../utils'
import { MediaViewer } from '../components/MediaViewer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TextInput } from '../components/TextInput'

type KindFilter = 'all' | 'video' | 'image'
type UsageFilter = 'all' | 'linked' | 'unlinked'

function parseEpisodeSegment(value: string | undefined): number | null {
  const match = value?.match(/^第(\d+)集$/)
  return match ? Number(match[1]) : null
}

function parseBeatSegment(value: string | undefined): number | null {
  const match = value?.match(/^第(\d+)拍$/)
  return match ? Number(match[1]) : null
}

function fileKind(file: File): 'video' | 'image' | null {
  if (
    file.type.startsWith('video/') ||
    /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)
  ) {
    return 'video'
  }
  if (
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name)
  ) {
    return 'image'
  }
  return null
}

type FolderNode = {
  name: string
  segments: string[]
  folders: Map<string, FolderNode>
  files: MediaAsset[]
}

type InUseDetails = {
  usageCount: number
  linkedRows: LinkedRow[]
}

function linkedRowLabel(row: LinkedRow): string {
  if (row.episodeNumber != null) {
    return `第${row.episodeNumber}集${
      row.episodeTitle ? ` · ${row.episodeTitle}` : ''
    }`
  }
  return row.sheetKind === 'beat' ? '节拍表' : '资产表'
}

function buildFolderTree(
  items: MediaAsset[],
  extraFolders: string[][] = [],
): FolderNode {
  const root: FolderNode = {
    name: '',
    segments: [],
    folders: new Map(),
    files: [],
  }
  function ensurePath(segments: string[]): FolderNode {
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
    return node
  }
  for (const item of items) {
    const segments = (item.folderPath ?? '文件库')
      .split(' / ')
      .filter(Boolean)
    ensurePath(segments).files.push(item)
  }
  for (const segments of extraFolders) {
    ensurePath(segments.filter(Boolean))
  }
  return root
}

function findNode(
  root: FolderNode,
  segments: string[],
): FolderNode | null {
  let node = root
  for (const segment of segments) {
    const child = node.folders.get(segment)
    if (!child) return null
    node = child
  }
  return node
}

function summarizeFolder(node: FolderNode): { files: number; bytes: number } {
  let files = node.files.length
  let bytes = node.files.reduce((sum, file) => sum + file.sizeBytes, 0)
  for (const child of node.folders.values()) {
    const summary = summarizeFolder(child)
    files += summary.files
    bytes += summary.bytes
  }
  return { files, bytes }
}

const ROLE_FOLDER_ORDER: Record<string, number> = {
  选定: 0,
  备选: 1,
}

function sortedFolders(node: FolderNode): FolderNode[] {
  return Array.from(node.folders.values()).sort((a, b) => {
    const roleDiff =
      (ROLE_FOLDER_ORDER[a.name] ?? 99) -
      (ROLE_FOLDER_ORDER[b.name] ?? 99)
    if (roleDiff !== 0 && (a.name in ROLE_FOLDER_ORDER || b.name in ROLE_FOLDER_ORDER)) {
      return roleDiff
    }
    return a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
  })
}

export function MediaLibraryPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [currentPath, setCurrentPath] = useState<string[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<MediaAsset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    asset: MediaAsset
    details?: InUseDetails
  } | null>(null)
  const [cardMenu, setCardMenu] = useState<{
    x: number
    y: number
    asset: MediaAsset
  } | null>(null)
  const [folderMenu, setFolderMenu] = useState<{
    x: number
    y: number
    node: FolderNode
  } | null>(null)
  const [archiveJob, setArchiveJob] = useState<ArchiveJob | null>(null)
  const [renameTarget, setRenameTarget] = useState<MediaAsset | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const mediaQuery = useQuery({
    queryKey: [
      'media',
      projectId,
      kindFilter,
      usageFilter,
      deferredSearch,
    ],
    queryFn: () =>
      api.listMedia(projectId!, {
        kind: kindFilter === 'all' ? undefined : kindFilter,
        usage: usageFilter === 'all' ? undefined : usageFilter,
        q: deferredSearch.trim() || undefined,
        limit: 500,
      }),
    enabled: Boolean(projectId),
  })

  const assetFoldersQuery = useQuery({
    queryKey: ['asset-folders', projectId],
    queryFn: () => api.listAssetFolders(projectId!),
    enabled: Boolean(projectId),
  })
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  })

  const items = mediaQuery.data?.items ?? []
  const virtualAssetFolders = useMemo(() => {
    if (kindFilter === 'video') return []
    const folders: string[][] = []
    for (const folder of assetFoldersQuery.data?.folders ?? []) {
      folders.push([
        '资产表',
        folder.categoryFolder,
        folder.nameFolder,
        '选定',
      ])
      folders.push([
        '资产表',
        folder.categoryFolder,
        folder.nameFolder,
        '备选',
      ])
    }
    return folders
  }, [assetFoldersQuery.data, kindFilter])
  const deliveryFolders = useMemo(() => {
    if (kindFilter === 'image') return []
    const folders: string[][] = [['成片']]
    const episodes = [...(projectQuery.data?.episodes ?? [])]
      .filter((episode) => !episode.deletedAt)
      .sort((a, b) => a.number - b.number)
    for (const episode of episodes) {
      folders.push(['成片', `第${episode.number}集`])
    }
    return folders
  }, [projectQuery.data?.episodes, kindFilter])
  const folderTree = useMemo(
    () => buildFolderTree(items, [...virtualAssetFolders, ...deliveryFolders]),
    [items, virtualAssetFolders, deliveryFolders],
  )
  const isSearching = deferredSearch.trim().length > 0

  useEffect(() => {
    if (!archiveJob || !projectId) return
    if (
      archiveJob.status === 'done' ||
      archiveJob.status === 'error' ||
      archiveJob.status === 'cancelled'
    ) {
      return
    }
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      try {
        const next = await api.getArchiveJob(projectId, archiveJob.jobId)
        if (!cancelled) setArchiveJob(next)
      } catch (error) {
        if (!cancelled) {
          setArchiveJob((current) =>
            current
              ? {
                  ...current,
                  status: 'error',
                  error:
                    error instanceof Error ? error.message : '打包失败',
                }
              : current,
          )
        }
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, 250)
      }
    }
    timer = window.setTimeout(tick, 250)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [archiveJob?.jobId, archiveJob?.status, projectId])

  useEffect(() => {
    if (archiveJob?.status !== 'done') return
    const timer = window.setTimeout(() => setArchiveJob(null), 6000)
    return () => window.clearTimeout(timer)
  }, [archiveJob?.status, archiveJob?.jobId])

  const currentNode = isSearching
    ? null
    : findNode(folderTree, currentPath) ?? folderTree
  const childFolders = currentNode ? sortedFolders(currentNode) : []
  const currentFiles = currentNode
    ? [...currentNode.files].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'zh-CN', { numeric: true }),
      )
    : []
  const searchFiles = isSearching
    ? [...items].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'zh-CN', { numeric: true }),
      )
    : []

  const folderEpisodeNumber = isSearching
    ? null
    : parseEpisodeSegment(currentPath[0])
  const folderBeatNumber = isSearching
    ? null
    : parseBeatSegment(currentPath[1])
  const isEpisodeFolder = folderEpisodeNumber !== null
  const isBeatFolder = isEpisodeFolder && folderBeatNumber !== null
  const isDeliveryFolder = !isSearching && currentPath[0] === '成片'
  const deliveryEpisodeNumber = isDeliveryFolder
    ? parseEpisodeSegment(currentPath[1])
    : null
  const isAssetFolder = !isSearching && currentPath[0] === '资产表'
  const folderCategory = isAssetFolder ? currentPath[1] : undefined
  const folderAssetName = isAssetFolder ? currentPath[2] : undefined
  const folderAssetRoleSegment = isAssetFolder ? currentPath[3] : undefined
  const folderAssetRole: 'selected' | 'alternate' | null =
    folderAssetRoleSegment === '选定'
      ? 'selected'
      : folderAssetRoleSegment === '备选'
        ? 'alternate'
        : null
  const isAssetRoleFolder = Boolean(
    isAssetFolder && folderCategory && folderAssetName && folderAssetRole,
  )
  const folderUploadKind: 'video' | 'image' | null = isDeliveryFolder
    ? 'video'
    : isEpisodeFolder
      ? 'video'
      : isAssetFolder
        ? 'image'
        : null
  const uploadAccept =
    folderUploadKind === 'video'
      ? 'video/*'
      : folderUploadKind === 'image'
        ? 'image/*'
        : 'video/*,image/*'
  const uploadLabel =
    folderUploadKind === 'video'
      ? '上传视频'
      : folderUploadKind === 'image'
        ? '上传图片'
        : '上传文件'
  const folderKindLabel =
    folderUploadKind === 'video'
      ? '视频'
      : folderUploadKind === 'image'
        ? '图片'
        : '文件'
  const folderKindUnit = folderUploadKind === 'image' ? '张' : '个'
  const folderTargetLabel = isBeatFolder
    ? `第${folderEpisodeNumber}集第${folderBeatNumber}拍`
    : isAssetRoleFolder
      ? `资产表 / ${folderCategory} / ${folderAssetName} / ${folderAssetRoleSegment}`
      : isAssetFolder
        ? folderCategory
          ? `资产表 / ${folderCategory}`
          : '资产表'
        : isDeliveryFolder
          ? deliveryEpisodeNumber
            ? `成片 / 第${deliveryEpisodeNumber}集`
            : '成片'
          : isEpisodeFolder
            ? `第${folderEpisodeNumber}集`
            : '文件库'

  async function uploadFiles(files: FileList | File[] | null) {
    if (!files || !projectId || uploading) return
    setUploading(true)
    const list = Array.from(files)
    let uploaded = 0
    let linked = 0
    let skipped = 0
    const linkErrors: string[] = []
    try {
      for (const file of list) {
        const kind = fileKind(file)
        if (!kind || (folderUploadKind && kind !== folderUploadKind)) {
          skipped += 1
          continue
        }

        const context = isDeliveryFolder
          ? {
              columnId: 'delivery.video',
              ...(deliveryEpisodeNumber !== null
                ? { episodeNumber: deliveryEpisodeNumber }
                : {}),
            }
          : isEpisodeFolder
          ? {
              columnId: 'beat.videos',
              role: 'video',
              episodeNumber: folderEpisodeNumber!,
              ...(isBeatFolder ? { beatNumber: folderBeatNumber! } : {}),
            }
          : isAssetRoleFolder
            ? {
                columnId:
                  folderAssetRole === 'selected'
                    ? 'asset.selected'
                    : 'asset.alternates',
                role: folderAssetRole ?? undefined,
                category: folderCategory,
                assetName: folderAssetName,
              }
            : isAssetFolder
              ? {
                  columnId: 'asset.library',
                  category: folderCategory,
                  assetName: folderAssetName,
                }
              : undefined

        const asset = await api.uploadMedia(projectId, kind, file, context)
        uploaded += 1

        if (isBeatFolder) {
          try {
            await api.addVideoToBeat(
              projectId,
              folderEpisodeNumber!,
              folderBeatNumber!,
              asset.id,
            )
            linked += 1
          } catch (error) {
            linkErrors.push(
              error instanceof Error ? error.message : '自动挂表失败',
            )
          }
        } else if (isAssetRoleFolder) {
          try {
            await api.addImageToAssetRow(
              projectId,
              folderCategory!,
              folderAssetName!,
              folderAssetRole!,
              asset.id,
            )
            linked += 1
          } catch (error) {
            linkErrors.push(
              error instanceof Error ? error.message : '自动挂表失败',
            )
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['media', projectId] })
      if (uploaded > 0) {
        setSearch('')
        setSelectedKey(null)
        if (!isEpisodeFolder && !isAssetFolder && !isDeliveryFolder) {
          setCurrentPath(['文件库'])
        }
        const parts = [
          `已上传 ${uploaded} ${folderKindUnit}${folderKindLabel}`,
        ]
        if (linked > 0) {
          parts.push(`已添加到${folderTargetLabel}`)
        }
        if (skipped > 0) {
          parts.push(
            folderUploadKind
              ? `跳过 ${skipped} 个非${folderKindLabel}文件`
              : `跳过 ${skipped} 个无法识别的文件`,
          )
        }
        if (linkErrors.length > 0) {
          parts.push(`自动挂表失败：${linkErrors[0]}`)
        }
        setToast(parts.join('；'))
      } else if (skipped > 0) {
        setToast(
          folderUploadKind
            ? `${folderTargetLabel}只支持${folderKindLabel}，已跳过 ${skipped} 个文件`
            : `没有识别到可上传的视频或图片，已跳过 ${skipped} 个文件`,
        )
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  function isFileDrag(event: React.DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer.types).includes('Files')
  }

  function handleLibraryDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    setDragActive(true)
  }

  function handleLibraryDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  function handleLibraryDragLeave(event: React.DragEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setDragActive(false)
  }

  function handleLibraryDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (!isFileDrag(event)) return
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) void uploadFiles(files)
  }

  async function requestDelete(asset: MediaAsset) {
    try {
      await api.deleteMedia(asset.id, false)
      await queryClient.invalidateQueries({ queryKey: ['media', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['recycle', projectId] })
      setViewer((current) => (current?.id === asset.id ? null : current))
      setSelectedKey((current) =>
        current === `asset:${asset.id}` ? null : current,
      )
      setToast('已移入回收站')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'MEDIA_IN_USE') {
        setDeleteTarget({
          asset,
          details: error.details as InUseDetails,
        })
      } else {
        setToast(error instanceof Error ? error.message : '删除失败')
      }
    }
  }

  function downloadAsset(asset: MediaAsset) {
    if (!asset.originalUrl) return
    const anchor = document.createElement('a')
    anchor.href = asset.originalUrl
    anchor.download = asset.displayName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  function openRename(asset: MediaAsset) {
    setRenameTarget(asset)
    setRenameValue(asset.displayName)
    setRenameError(null)
  }

  async function submitRename() {
    if (!renameTarget) return
    const value = renameValue.trim()
    if (!value) {
      setRenameError('文件名不能为空')
      return
    }
    setBusy(true)
    try {
      const result = await api.renameMedia(renameTarget.id, value)
      await queryClient.invalidateQueries({ queryKey: ['media', projectId] })
      setViewer((current) =>
        current?.id === result.asset.id
          ? { ...current, ...result.asset }
          : current,
      )
      setRenameTarget(null)
      setToast('文件名已更新')
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : '重命名失败')
    } finally {
      setBusy(false)
    }
  }

  async function forceDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api.deleteMedia(deleteTarget.asset.id, true)
      await queryClient.invalidateQueries({ queryKey: ['media', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['recycle', projectId] })
      setViewer((current) =>
        current?.id === deleteTarget.asset.id ? null : current,
      )
      setDeleteTarget(null)
      setToast('已解除引用并移入回收站')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  function openFolder(segments: string[]) {
    setSearch('')
    setSelectedKey(null)
    setCurrentPath(segments)
  }

  function triggerArchiveDownload(job: ArchiveJob) {
    if (!projectId) return
    const anchor = document.createElement('a')
    anchor.href = api.archiveDownloadUrl(projectId, job.jobId)
    anchor.download = `${job.folderName}.zip`
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  async function startFolderArchive(node: FolderNode) {
    if (!projectId) return
    if (
      archiveJob &&
      (archiveJob.status === 'queued' || archiveJob.status === 'running')
    ) {
      setToast('已有文件夹正在打包，请稍候')
      setFolderMenu(null)
      return
    }
    setFolderMenu(null)
    try {
      const job = await api.createArchiveJob(projectId, node.segments)
      setArchiveJob(job)
      triggerArchiveDownload(job)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '打包失败')
    }
  }

  function renderFolderCard(node: FolderNode) {
    const key = `folder:${node.segments.join('/')}`
    return (
      <button
        type="button"
        key={key}
        className={`file-card folder-card ${selectedKey === key ? 'selected' : ''}`}
        onClick={() => setSelectedKey(key)}
        onDoubleClick={() => openFolder(node.segments)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            openFolder(node.segments)
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setSelectedKey(key)
          setFolderMenu({
            x: event.clientX,
            y: event.clientY,
            node,
          })
        }}
        title={`双击打开 · 右键下载 ${node.segments.join(' / ')}`}
      >
        <div className="file-card-thumb is-folder">
          <Folder size={64} strokeWidth={1.25} />
        </div>
        <div className="file-card-name">{node.name}</div>
        <div className="file-card-meta">文件夹</div>
      </button>
    )
  }

  function renderFileCard(asset: MediaAsset) {
    const key = `asset:${asset.id}`
    return (
      <div
        key={asset.id}
        role="button"
        tabIndex={0}
        className={`file-card ${selectedKey === key ? 'selected' : ''}`}
        draggable
        onClick={() => setSelectedKey(key)}
        onDoubleClick={() => setViewer(asset)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setViewer(asset)
        }}
        onDragStart={(event) => {
          setSelectedKey(key)
          event.dataTransfer.setData('application/x-frame-asset', asset.id)
          event.dataTransfer.effectAllowed = 'copy'
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          setSelectedKey(key)
          setCardMenu({
            x: event.clientX,
            y: event.clientY,
            asset,
          })
        }}
        title="双击查看，右键更多操作，可拖到表格行"
      >
        <div
          className={`file-card-thumb ${
            asset.kind === 'video' ? 'is-video' : 'is-image'
          }`}
        >
          {asset.kind === 'image' && asset.thumbnailUrl ? (
            <img src={asset.thumbnailUrl} alt={asset.displayName} loading="lazy" />
          ) : asset.kind === 'video' ? (
            <Film size={44} strokeWidth={1.4} />
          ) : (
            <ImageIcon size={44} strokeWidth={1.4} />
          )}
          {asset.status !== 'ready' ? (
            <span className={`status-badge status-${asset.status}`}>
              {asset.status === 'failed' ? '失败' : '处理中'}
            </span>
          ) : null}
        </div>
        <div className="file-card-name" title={asset.displayName}>
          {asset.displayName}
        </div>
        <div
          className="file-card-meta"
          title={isSearching ? asset.folderPath : undefined}
        >
          {isSearching
            ? (asset.folderPath ?? '文件库')
            : `${asset.kind === 'video' ? '视频' : '图片'} · ${formatBytes(asset.sizeBytes)}`}
        </div>
      </div>
    )
  }

  const breadcrumb = currentPath
  const visibleFolders = isSearching ? [] : childFolders
  const visibleFiles = isSearching ? searchFiles : currentFiles
  const empty =
    !mediaQuery.isLoading &&
    visibleFolders.length === 0 &&
    visibleFiles.length === 0
  const folderMenuStats = folderMenu ? summarizeFolder(folderMenu.node) : null
  const archivePercent = !archiveJob
    ? 0
    : archiveJob.status === 'done'
      ? 100
      : archiveJob.totalBytes > 0
        ? Math.min(
            100,
            Math.round(
              (archiveJob.processedBytes / archiveJob.totalBytes) * 100,
            ),
          )
        : archiveJob.totalFiles > 0
          ? Math.round(
              (archiveJob.processedFiles / archiveJob.totalFiles) * 100,
            )
          : 0

  return (
    <div className="library-page">
      <div
        className="file-manager"
        onDragEnter={handleLibraryDragEnter}
        onDragOver={handleLibraryDragOver}
        onDragLeave={handleLibraryDragLeave}
        onDrop={handleLibraryDrop}
      >
        <section className="file-contents">
          <div className="file-toolbar">
            <IconButton
              size="small"
              disabled={currentPath.length === 0}
              onClick={() =>
                setCurrentPath(currentPath.slice(0, currentPath.length - 1))
              }
              title="上一级"
            >
              <ArrowUp size={16} />
            </IconButton>
            <div className="file-breadcrumb">
              <button type="button" onClick={() => openFolder([])}>
                文件库
              </button>
              {breadcrumb.map((segment, index) => (
                <span
                  key={`${segment}-${index}`}
                  className="file-breadcrumb-part"
                >
                  <ChevronRight size={13} />
                  <button
                    type="button"
                    onClick={() =>
                      openFolder(breadcrumb.slice(0, index + 1))
                    }
                  >
                    {segment}
                  </button>
                </span>
              ))}
              {isSearching ? (
                <span className="file-search-label">搜索结果</span>
              ) : null}
            </div>
            <div className="file-toolbar-spacer" />
            <div className="filter-pills">
              {(
                [
                  ['all', '全部'],
                  ['video', '视频'],
                  ['image', '图片'],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`filter-pill ${kindFilter === value ? 'active' : ''}`}
                  onClick={() => setKindFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="filter-pills">
              {(
                [
                  ['all', '全部'],
                  ['linked', '已使用'],
                  ['unlinked', '未使用'],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`filter-pill ${usageFilter === value ? 'active' : ''}`}
                  onClick={() => setUsageFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <TextInput
              placeholder="搜索文件名…"
              value={search}
              onChange={setSearch}
              className="file-search"
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<Upload size={15} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? '上传中…' : uploadLabel}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept={uploadAccept}
              onChange={(event) => {
                void uploadFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </div>

          <div className="file-grid">
            {mediaQuery.isLoading ? (
              <div className="page-loading file-grid-empty">
                <CircularProgress size={26} />
                <Typography color="text.secondary">载入文件库…</Typography>
              </div>
            ) : empty ? (
              <div className="library-empty file-empty">
                <Folder size={52} color="var(--muted-2)" strokeWidth={1.2} />
                <Typography variant="h2">
                  {isSearching ? '没有匹配的文件' : '此文件夹为空'}
                </Typography>
                {!isSearching ? (
                  <Button
                    variant="outlined"
                    startIcon={<Upload size={16} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadLabel}
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                {visibleFolders.map(renderFolderCard)}
                {visibleFiles.map(renderFileCard)}
              </>
            )}
          </div>
          {dragActive ? (
            <div className="file-drop-overlay" aria-hidden="true">
              <Upload size={30} />
              <span>松开即可上传到 {folderTargetLabel}</span>
              <small>
                {folderUploadKind
                  ? `只接受${folderKindLabel}，支持一次拖入多个文件`
                  : '支持视频和图片，可一次拖入多个文件'}
              </small>
            </div>
          ) : null}
        </section>
      </div>

      <MediaViewer
        asset={viewer}
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
      />

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
          onClick={() => {
            if (cardMenu) downloadAsset(cardMenu.asset)
            setCardMenu(null)
          }}
        >
          <Download size={16} />
          下载
        </MenuItem>
        <MenuItem
          sx={{ gap: 1 }}
          onClick={() => {
            if (cardMenu) openRename(cardMenu.asset)
            setCardMenu(null)
          }}
        >
          <Pencil size={16} />
          重命名
        </MenuItem>
        <MenuItem
          sx={{ gap: 1, color: 'error.main' }}
          onClick={() => {
            if (cardMenu) void requestDelete(cardMenu.asset)
            setCardMenu(null)
          }}
        >
          <Trash2 size={16} />
          删除
        </MenuItem>
      </Menu>

      <Menu
        open={Boolean(folderMenu)}
        onClose={() => setFolderMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          folderMenu ? { top: folderMenu.y, left: folderMenu.x } : undefined
        }
      >
        <MenuItem
          sx={{ gap: 1 }}
          onClick={() => {
            if (folderMenu) openFolder(folderMenu.node.segments)
            setFolderMenu(null)
          }}
        >
          <Folder size={16} />
          打开
        </MenuItem>
        <MenuItem
          sx={{ gap: 1 }}
          disabled={!folderMenuStats || folderMenuStats.files === 0}
          onClick={() => {
            if (folderMenu) void startFolderArchive(folderMenu.node)
          }}
        >
          <Download size={16} />
          下载文件夹
          {folderMenuStats ? (
            <span className="menu-hint">
              {folderMenuStats.files} 个文件 ·{' '}
              {formatBytes(folderMenuStats.bytes)}
            </span>
          ) : null}
        </MenuItem>
      </Menu>

      <Dialog
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>重命名媒体</DialogTitle>
        <DialogContent>
          <div style={{ paddingTop: 8 }}>
            <TextInput
              autoFocus
              label="文件名"
              value={renameValue}
              onChange={setRenameValue}
              error={renameError}
            />
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setRenameTarget(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void submitRename()}
            disabled={busy || !renameValue.trim()}
          >
            {busy ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="媒体仍在使用"
        description={
          deleteTarget?.details ? (
            <div>
              <p>
                该媒体仍被 {deleteTarget.details.usageCount}{' '}
                处使用。继续删除会先解除所有这些引用，然后把媒体移入回收站。
              </p>
              <ul className="usage-list">
                {deleteTarget.details.linkedRows?.map((row, index) => (
                  <li key={`${row.sheetId}-${row.rowId}-${index}`}>
                    {linkedRowLabel(row)} ·{' '}
                    {row.role === 'selected'
                      ? '选定'
                      : row.role === 'alternate'
                        ? '备选'
                        : '视频'}
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        }
        confirmLabel="仍要删除"
        confirmColor="error"
        busy={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void forceDelete()}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2400}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {archiveJob ? (
        <div
          className={`archive-progress archive-${archiveJob.status}`}
          role="status"
          aria-live="polite"
        >
          <div className="archive-progress-head">
            <span className="archive-progress-title">
              {archiveJob.status === 'done'
                ? '打包完成'
                : archiveJob.status === 'error'
                  ? '打包失败'
                  : archiveJob.status === 'cancelled'
                    ? '打包已取消'
                    : '正在打包'}
              <span className="archive-progress-folder">
                {archiveJob.folderName}
              </span>
            </span>
            <button
              type="button"
              className="archive-progress-close"
              onClick={() => setArchiveJob(null)}
              aria-label="关闭打包进度"
            >
              <X size={15} />
            </button>
          </div>
          <LinearProgress
            variant={
              archiveJob.totalBytes > 0 ? 'determinate' : 'indeterminate'
            }
            value={archivePercent}
            className="archive-progress-bar"
          />
          <div className="archive-progress-meta">
            {archiveJob.status === 'done'
              ? `浏览器正在下载 · ${archiveJob.totalFiles} 个文件 · ${formatBytes(archiveJob.totalBytes)}`
              : archiveJob.status === 'error'
                ? archiveJob.error ?? '压缩失败'
                : archiveJob.status === 'cancelled'
                  ? '下载已取消'
                  : `${archiveJob.processedFiles}/${archiveJob.totalFiles} 个文件 · ${archivePercent}% · ${formatBytes(archiveJob.processedBytes)} / ${formatBytes(archiveJob.totalBytes)}`}
          </div>
          {archiveJob.missingFiles > 0 ? (
            <div className="archive-progress-note">
              {archiveJob.missingFiles} 个文件不可用，已跳过
            </div>
          ) : null}
          {archiveJob.status === 'queued' ? (
            <button
              type="button"
              className="archive-progress-start"
              onClick={() => triggerArchiveDownload(archiveJob)}
            >
              开始下载
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
