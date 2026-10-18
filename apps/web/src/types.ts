export type SheetKind = 'beat' | 'asset'
export type MediaKind = 'video' | 'image'

export type ColumnDef = {
  id: string
  label: string
  dataType:
    | 'text'
    | 'long_text'
    | 'enum_color'
    | 'beat_no'
    | 'episode_refs'
    | 'media_videos'
    | 'media_selected'
    | 'media_alternates'
    | 'note_mentions'
  config?: Record<string, unknown>
  position: number
}

export type Project = {
  id: string
  name: string
  episodeCount: number
  assetSheetId: string | null
  createdAt: string
  updatedAt: string
}

export type Episode = {
  id: string
  projectId: string
  number: number
  title: string | null
  position: number
  deletedAt: string | null
  deletionBatchId: string | null
}

export type Sheet = {
  id: string
  projectId: string
  kind: SheetKind
  episodeId: string | null
  name: string
  position: number
  schemaVersion: number
  metadataRevision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  deletionBatchId: string | null
  episodeNumber: number | null
  episodeTitle: string | null
}

export type ProjectDetail = {
  project: Project
  episodes: Episode[]
  sheets: Sheet[]
}

export type SheetDetail = {
  sheet: Sheet
  columns: ColumnDef[]
  episodes?: Episode[]
}

export type LinkedRow = {
  sheetId: string
  sheetName?: string
  sheetKind?: SheetKind
  episodeNumber?: number | null
  episodeTitle?: string | null
  rowId: string
  columnId: string
  role: string
}

export type MediaAsset = {
  id: string
  projectId: string
  kind: MediaKind
  displayName: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationMs: number | null
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  processingError: string | null
  thumbnailUrl: string | null
  originalUrl: string | null
  createdAt: string
  deletedAt: string | null
  folderPath?: string
  usageCount?: number
  linkedRows?: LinkedRow[]
}

export type MediaListResponse = {
  items: MediaAsset[]
  nextCursor: string | null
}

export type AssetFolderRef = {
  category: string
  name: string
  categoryFolder: string
  nameFolder: string
}

export type RecycleMedia = {
  assetId: string
  kind: MediaKind
  displayName: string
  thumbnailUrl: string | null
  originalUrl: string | null
}

export type RecycleReferencedMedia = RecycleMedia & {
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationMs: number | null
  status: MediaAsset['status']
  processingError: string | null
  createdAt: string
  folderPath?: string
  deleted: boolean
  deletedInBatch: boolean
  shared: boolean
  usageCount: number
}

export type RecycleBatch = {
  id: string
  kind: 'row' | 'sheet' | 'media'
  status: string
  createdAt: string
  metadata: {
    sheetId?: string
    sheetName?: string
    episodeNumber?: number | null
    episodeTitle?: string | null
    rowId?: string
    rowSummary?: string
    fileName?: string
    itemCounts?: { rows?: number; media?: number }
    [key: string]: unknown
  }
  media: RecycleMedia[]
  referencedMedia: RecycleReferencedMedia[]
  canRestore: boolean
  restoreBlockedReason: string | null
}

export type RecycleBinResponse = {
  batches: RecycleBatch[]
}

export type ApiErrorBody = {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}
