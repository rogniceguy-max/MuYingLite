import { v7 as uuidv7 } from 'uuid'
import type {
  ArchiveJob,
  AssetFolderRef,
  Episode,
  MediaAsset,
  MediaKind,
  MediaListResponse,
  Project,
  ProjectDetail,
  RecycleBinResponse,
  Sheet,
  SheetDetail,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''
export type UploadContext = {
  sheetId?: string
  rowId?: string
  columnId?: string
  role?: string
  episodeNumber?: number
  beatNumber?: number
  category?: string
  assetName?: string
}

export const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:1234`

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!response.ok) {
    let body: any = null
    try {
      body = await response.json()
    } catch {
      // ignore
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'REQUEST_FAILED',
      body?.error?.message ?? `请求失败 (${response.status})`,
      body?.error?.details,
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  listProjects: () =>
    request<{ projects: Project[] }>('/api/projects').then((r) => r.projects),

  createProject: (
    name: string,
    firstEpisode?: { number?: number; title?: string | null },
  ) =>
    request<ProjectDetail>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, firstEpisode }),
    }),

  getProject: (projectId: string) =>
    request<ProjectDetail>(`/api/projects/${projectId}`),

  listAssetFolders: (projectId: string) =>
    request<{ folders: AssetFolderRef[] }>(
      `/api/projects/${projectId}/asset-folders`,
    ),

  updateProject: (projectId: string, name: string) =>
    request<{ id: string; name: string }>(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  createEpisode: (projectId: string, number: number, title: string | null) =>
    request<{ episode: Episode; sheet: Sheet }>(
      `/api/projects/${projectId}/episodes`,
      {
        method: 'POST',
        body: JSON.stringify({ number, title }),
      },
    ),

  updateEpisode: (
    episodeId: string,
    data: { number?: number; title?: string | null },
  ) =>
    request<Episode>(`/api/episodes/${episodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteEpisode: (episodeId: string) =>
    request<{ batchId: string; sheetId: string }>(
      `/api/episodes/${episodeId}`,
      { method: 'DELETE' },
    ),

  getSheet: (sheetId: string) =>
    request<SheetDetail>(`/api/sheets/${sheetId}`),

  addVideoToBeat: (
    projectId: string,
    episodeNumber: number,
    beatNumber: number,
    assetId: string,
  ) =>
    request<{ sheetId: string; rowId: string; linkId: string; added: boolean }>(
      `/api/projects/${projectId}/beat-video-links`,
      {
        method: 'POST',
        body: JSON.stringify({ episodeNumber, beatNumber, assetId }),
      },
    ),

  addImageToAssetRow: (
    projectId: string,
    category: string,
    assetName: string,
    role: 'selected' | 'alternate',
    assetId: string,
  ) =>
    request<{ sheetId: string; rowId: string; linkId: string; added: boolean }>(
      `/api/projects/${projectId}/asset-image-links`,
      {
        method: 'POST',
        body: JSON.stringify({ category, assetName, role, assetId }),
      },
    ),

  renameSheet: (sheetId: string, name: string, expectedRevision?: number) =>
    request<{ sheetId: string; name: string; metadataRevision: number }>(
      `/api/sheets/${sheetId}`,
      {
        method: 'PATCH',
        headers:
          expectedRevision === undefined
            ? undefined
            : { 'If-Match': String(expectedRevision) },
        body: JSON.stringify({ name }),
      },
    ),

  listMedia: (
    projectId: string,
    query: {
      kind?: MediaKind
      status?: string
      usage?: string
      q?: string
      limit?: number
    } = {},
  ) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value))
    }
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return request<MediaListResponse>(
      `/api/projects/${projectId}/media${suffix}`,
    )
  },

  createArchiveJob: (projectId: string, folder: string[]) =>
    request<{ job: ArchiveJob }>(
      `/api/projects/${projectId}/archive-jobs`,
      {
        method: 'POST',
        body: JSON.stringify({ folder }),
      },
    ).then((response) => response.job),

  getArchiveJob: (projectId: string, jobId: string) =>
    request<{ job: ArchiveJob }>(
      `/api/projects/${projectId}/archive-jobs/${jobId}`,
    ).then((response) => response.job),

  archiveDownloadUrl: (projectId: string, jobId: string) =>
    `${API_BASE}/api/projects/${projectId}/archive-jobs/${jobId}/file`,

  getMedia: (assetId: string) =>
    request<{
      asset: MediaAsset
      urls: { thumbnail: string | null; original: string | null; proxy: string | null }
      usageCount: number
    }>(`/api/media/${assetId}`),

  uploadMedia: async (
    projectId: string,
    kind: MediaKind,
    file: File,
    context?: UploadContext,
  ) => {
    const assetId = uuidv7()
    const params = new URLSearchParams({ kind, assetId })
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, String(value))
        }
      }
    }
    const form = new FormData()
    form.append('file', file, file.name)
    const response = await request<{ asset: MediaAsset }>(
      `/api/projects/${projectId}/media?${params.toString()}`,
      { method: 'POST', body: form },
    )
    return response.asset
  },

  renameMedia: (assetId: string, displayName: string) =>
    request<{ asset: MediaAsset }>(`/api/media/${assetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    }),

  deleteMedia: (assetId: string, force = false) =>
    request<{ batchId: string; removedLinks: number }>(
      `/api/media/${assetId}${force ? '?force=true' : ''}`,
      { method: 'DELETE' },
    ),

  listRecycleBin: (projectId: string) =>
    request<RecycleBinResponse>(
      `/api/projects/${projectId}/recycle-bin`,
    ),

  restoreBatch: (projectId: string, batchId: string) =>
    request<{ batchId: string; status: string }>(
      `/api/projects/${projectId}/recycle-bin/${batchId}/restore`,
      { method: 'POST' },
    ),

  purgeBatch: (projectId: string, batchId: string) =>
    request<{ batchId: string; status: string }>(
      `/api/projects/${projectId}/recycle-bin/${batchId}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE' }),
      },
    ),

  purgeAll: (projectId: string) =>
    request<{ purged: string[] }>(
      `/api/projects/${projectId}/recycle-bin`,
      {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE' }),
      },
    ),
}
