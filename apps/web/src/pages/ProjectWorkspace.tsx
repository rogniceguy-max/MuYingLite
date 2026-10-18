import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Outlet,
  useLocation,
  useMatch,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  ChevronRight,
  FolderOpen,
  Pencil,
  Plus,
  Settings,
  Table2,
  Trash2,
} from 'lucide-react'
import { api } from '../api'
import type { Episode, ProjectDetail, Sheet } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TextInput } from '../components/TextInput'
import { ThemeToggle } from '../components/ThemeToggle'

type EpisodeDialogState = {
  episode?: Episode
  number: string
  title: string
}

export function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const sheetMatch = useMatch('/projects/:projectId/sheets/:sheetId')
  const activeSheetId = sheetMatch?.params.sheetId

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  })

  const [projectMenu, setProjectMenu] = useState<{
    x: number
    y: number
  } | null>(null)
  const [projectRenameOpen, setProjectRenameOpen] = useState(false)
  const [projectNameValue, setProjectNameValue] = useState('')
  const [projectRenameBusy, setProjectRenameBusy] = useState(false)
  const [projectRenameError, setProjectRenameError] = useState<string | null>(
    null,
  )
  const [episodeDialog, setEpisodeDialog] = useState<EpisodeDialogState | null>(
    null,
  )
  const [deleteEpisodeTarget, setDeleteEpisodeTarget] =
    useState<Episode | null>(null)
  const [episodeMenu, setEpisodeMenu] = useState<{
    x: number
    y: number
    episode: Episode
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const activeSheetIdRef = useRef<string | undefined>(activeSheetId)
  useEffect(() => {
    activeSheetIdRef.current = activeSheetId
  }, [activeSheetId])

  useEffect(() => {
    if (!projectId) return

    const source = new EventSource(`/api/projects/${projectId}/events`)

    const handleRename = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          sheetId: string
          name: string
          metadataRevision: number
        }
        queryClient.setQueryData<ProjectDetail>(
          ['project', projectId],
          (old) =>
            old
              ? {
                  ...old,
                  sheets: old.sheets.map((sheet) =>
                    sheet.id === data.sheetId
                      ? {
                          ...sheet,
                          name: data.name,
                          metadataRevision: data.metadataRevision,
                        }
                      : sheet,
                  ),
                }
              : old,
        )
        queryClient.setQueryData<any>(['sheet', data.sheetId], (old: any) =>
          old
            ? {
                ...old,
                sheet: {
                  ...old.sheet,
                  name: data.name,
                  metadataRevision: data.metadataRevision,
                },
              }
            : old,
        )
      } catch {
        // ignore malformed event
      }
    }

    const invalidateProject = () => {
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    }
    const invalidateMedia = () => {
      void queryClient.invalidateQueries({ queryKey: ['media', projectId] })
    }
    const handleRecycle = () => {
      void queryClient.invalidateQueries({ queryKey: ['recycle', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['media', projectId] })
    }
    const handleEpisodeDeleted = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { sheetId?: string }
        if (data.sheetId && data.sheetId === activeSheetIdRef.current) {
          navigate(`/projects/${projectId}`)
        }
      } catch {
        // ignore
      }
      invalidateProject()
      handleRecycle()
    }

    source.addEventListener('sheet.renamed', handleRename)
    source.addEventListener('episode.created', invalidateProject)
    source.addEventListener('episode.updated', invalidateProject)
    source.addEventListener('episode.deleted', handleEpisodeDeleted)
    source.addEventListener('episode.restored', invalidateProject)
    source.addEventListener('project.updated', invalidateProject)
    source.addEventListener('media.updated', invalidateMedia)
    source.addEventListener('recycle_bin.changed', handleRecycle)

    return () => {
      source.close()
    }
  }, [projectId, queryClient, navigate])

  const project = projectQuery.data?.project
  const episodes = useMemo(
    () =>
      (projectQuery.data?.episodes ?? [])
        .filter((episode) => !episode.deletedAt)
        .sort((a, b) => a.position - b.position || a.number - b.number),
    [projectQuery.data?.episodes],
  )
  const sheets = projectQuery.data?.sheets ?? []
  const assetSheet = sheets.find((sheet) => sheet.kind === 'asset')
  const activeSheet = sheets.find((sheet) => sheet.id === activeSheetId)

  function beatSheetFor(episodeId: string): Sheet | undefined {
    return sheets.find(
      (sheet) => sheet.kind === 'beat' && sheet.episodeId === episodeId,
    )
  }

  function nextEpisodeNumber(): number {
    const all = projectQuery.data?.episodes ?? []
    return all.reduce((max, episode) => Math.max(max, episode.number), 0) + 1
  }

  function openProjectRename() {
    setProjectRenameError(null)
    setProjectNameValue(project?.name ?? '')
    setProjectRenameOpen(true)
  }

  async function submitProjectRename() {
    if (!projectId) return
    const name = projectNameValue.trim()
    if (!name) {
      setProjectRenameError('项目名不能为空')
      return
    }
    setProjectRenameBusy(true)
    setProjectRenameError(null)
    try {
      await api.updateProject(projectId, name)
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setProjectRenameOpen(false)
      setToast('项目名已更新')
    } catch (error) {
      setProjectRenameError(
        error instanceof Error ? error.message : '重命名失败',
      )
    } finally {
      setProjectRenameBusy(false)
    }
  }

  function openAddEpisode() {
    setDialogError(null)
    setEpisodeDialog({
      number: String(nextEpisodeNumber()),
      title: '',
    })
  }

  function openEditEpisode(episode: Episode) {
    setDialogError(null)
    setEpisodeDialog({
      episode,
      number: String(episode.number),
      title: episode.title ?? '',
    })
  }

  async function submitEpisode() {
    if (!episodeDialog || !projectId) return
    setBusy(true)
    setDialogError(null)
    try {
      if (episodeDialog.episode) {
        await api.updateEpisode(episodeDialog.episode.id, {
          number: Number(episodeDialog.number),
          title: episodeDialog.title.trim() || null,
        })
        await queryClient.invalidateQueries({
          queryKey: ['project', projectId],
        })
        setToast('集信息已更新')
        setEpisodeDialog(null)
      } else {
        const result = await api.createEpisode(
          projectId,
          Number(episodeDialog.number),
          episodeDialog.title.trim() || null,
        )
        await queryClient.invalidateQueries({
          queryKey: ['project', projectId],
        })
        setToast('已创建新集与 8 行节拍表')
        setEpisodeDialog(null)
        navigate(`/projects/${projectId}/sheets/${result.sheet.id}`)
      }
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteEpisode() {
    if (!deleteEpisodeTarget || !projectId) return
    setBusy(true)
    try {
      const targetSheet = beatSheetFor(deleteEpisodeTarget.id)
      await api.deleteEpisode(deleteEpisodeTarget.id)
      await queryClient.invalidateQueries({
        queryKey: ['project', projectId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['recycle', projectId],
      })
      setDeleteEpisodeTarget(null)
      setToast('整集已移入回收站')
      if (activeSheetId && targetSheet?.id === activeSheetId) {
        navigate(`/projects/${projectId}`)
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  if (projectQuery.isLoading) {
    return (
      <div className="page-loading page-loading-full">
        <div className="loading-mark">沐影库</div>
        <Typography color="text.secondary">载入项目…</Typography>
      </div>
    )
  }

  if (projectQuery.error || !project) {
    return (
      <div className="page-error">
        <Typography variant="h5">项目不存在</Typography>
        <Button variant="outlined" sx={{ mt: 2 }} onClick={() => navigate('/')}>
          返回项目列表
        </Button>
      </div>
    )
  }

  const path = location.pathname
  const activeEpisode =
    activeSheet?.kind === 'beat'
      ? episodes.find((episode) => episode.id === activeSheet.episodeId)
      : undefined
  const pageLabel = activeSheet
    ? activeSheet.kind === 'asset'
      ? '资产表'
      : activeEpisode
        ? `第${activeEpisode.number}集${
            activeEpisode.title ? ` · ${activeEpisode.title}` : ''
          }`
        : '节拍表'
    : path.endsWith('/media')
      ? '文件库'
      : path.endsWith('/recycle-bin')
        ? '回收站'
        : path.endsWith('/settings')
          ? '项目设置'
          : '项目'

  return (
    <div className="workspace">
      <aside className="sidebar">
        <button
          type="button"
          className="brand sidebar-brand"
          onClick={() => navigate('/')}
          title="返回项目列表"
        >
          <div className="brand-mark">沐</div>
          <div>
            <div className="brand-name">沐影库</div>
          </div>
        </button>

        <div className="sidebar-project">
          <button
            type="button"
            className="sidebar-project-name"
            onDoubleClick={openProjectRename}
            onContextMenu={(event) => {
              event.preventDefault()
              setProjectMenu({ x: event.clientX, y: event.clientY })
            }}
            title="双击或右键重命名项目"
          >
            {project.name}
          </button>
          <div className="sidebar-project-meta">{episodes.length} 集</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">
            <span>剧集</span>
            <Tooltip title="新增一集（自动建 8 行节拍表）">
              <IconButton size="small" onClick={openAddEpisode}>
                <Plus size={16} />
              </IconButton>
            </Tooltip>
          </div>

          <div className="episode-list">
            {episodes.map((episode) => {
              const sheet = beatSheetFor(episode.id)
              const active = activeSheetId === sheet?.id
              return (
                <div
                  key={episode.id}
                  className={`nav-episode ${active ? 'active' : ''}`}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setEpisodeMenu({
                      x: event.clientX,
                      y: event.clientY,
                      episode,
                    })
                  }}
                >
                  <button
                    type="button"
                    className="episode-main"
                    onClick={() => {
                      if (sheet) {
                        navigate(`/projects/${projectId}/sheets/${sheet.id}`)
                      }
                    }}
                    disabled={!sheet}
                  >
                    <span className="episode-title">
                      第{episode.number}集
                      {episode.title ? ` · ${episode.title}` : ''}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

        </nav>

        <div className="sidebar-utility">
          <div
            className={`nav-item asset-nav ${
              activeSheet?.kind === 'asset' ? 'active' : ''
            } ${assetSheet ? '' : 'disabled'}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (assetSheet) {
                navigate(`/projects/${projectId}/sheets/${assetSheet.id}`)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && assetSheet) {
                navigate(`/projects/${projectId}/sheets/${assetSheet.id}`)
              }
            }}
          >
            <Table2 size={16} className="nav-symbol" />
            <span className="nav-item-text">
              <span>资产表</span>
            </span>
          </div>

          <div className="nav-section-title" style={{ marginTop: 18 }}>
            <span>项目</span>
          </div>

          <button
            type="button"
            className={`nav-item ${path.endsWith('/media') ? 'active' : ''}`}
            onClick={() => navigate(`/projects/${projectId}/media`)}
          >
            <FolderOpen size={16} />
            <span className="nav-item-text">
              <span>文件库</span>
            </span>
          </button>

          <button
            type="button"
            className={`nav-item ${
              path.endsWith('/recycle-bin') ? 'active' : ''
            }`}
            onClick={() => navigate(`/projects/${projectId}/recycle-bin`)}
          >
            <Trash2 size={16} />
            <span className="nav-item-text">
              <span>回收站</span>
            </span>
          </button>
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`nav-item ${path.endsWith('/settings') ? 'active' : ''}`}
            onClick={() => navigate(`/projects/${projectId}/settings`)}
          >
            <Settings size={16} />
            <span className="nav-item-text">
              <span>项目设置</span>
            </span>
          </button>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{project.name}</span>
            <ChevronRight size={14} />
            <span className="breadcrumb-current">{pageLabel}</span>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
          </div>
        </header>
        <main className="workspace-content">
          <Outlet />
        </main>
      </div>

      <Menu
        open={Boolean(projectMenu)}
        onClose={() => setProjectMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          projectMenu ? { top: projectMenu.y, left: projectMenu.x } : undefined
        }
      >
        <MenuItem
          sx={{ gap: 1 }}
          onClick={() => {
            setProjectMenu(null)
            openProjectRename()
          }}
        >
          <Pencil size={16} />
          重命名项目
        </MenuItem>
      </Menu>

      <Menu
        open={Boolean(episodeMenu)}
        onClose={() => setEpisodeMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          episodeMenu
            ? { top: episodeMenu.y, left: episodeMenu.x }
            : undefined
        }
      >
        <MenuItem
          onClick={() => {
            if (episodeMenu) openEditEpisode(episodeMenu.episode)
            setEpisodeMenu(null)
          }}
        >
          编辑集
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (episodeMenu) setDeleteEpisodeTarget(episodeMenu.episode)
            setEpisodeMenu(null)
          }}
          sx={{ color: 'error.main' }}
        >
          删除整集
        </MenuItem>
      </Menu>

      <Dialog
        open={projectRenameOpen}
        onClose={() => setProjectRenameOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>重命名项目</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            只修改项目显示名，不影响表内内容或其他用户正在编辑的表格。
          </Typography>
          <TextInput
            autoFocus
            label="项目名"
            value={projectNameValue}
            onChange={setProjectNameValue}
            error={projectRenameError}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setProjectRenameOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void submitProjectRename()}
            disabled={projectRenameBusy || !projectNameValue.trim()}
          >
            {projectRenameBusy ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(episodeDialog)}
        onClose={() => setEpisodeDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {episodeDialog?.episode ? '编辑集' : '新增一集'}
        </DialogTitle>
        <DialogContent>
          {!episodeDialog?.episode ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              新增集会自动创建一张 8 行的空白节拍表。
            </Typography>
          ) : null}
          <div className="field-block">
            <TextInput
              autoFocus
              label="集号"
              type="number"
              value={episodeDialog?.number ?? ''}
              onChange={(number) =>
                setEpisodeDialog((current) =>
                  current ? { ...current, number } : current,
                )
              }
            />
          </div>
          <TextInput
            label="集标题（可选）"
            value={episodeDialog?.title ?? ''}
            onChange={(title) =>
              setEpisodeDialog((current) =>
                current ? { ...current, title } : current,
              )
            }
            error={dialogError}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setEpisodeDialog(null)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void submitEpisode()}
            disabled={busy || !episodeDialog?.number}
          >
            {busy ? '保存中…' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteEpisodeTarget)}
        title="删除整集？"
        description={
          <>
            第 {deleteEpisodeTarget?.number} 集的节拍表、行和媒体会进入回收站。
            仍被资产表或其他行使用的媒体会保留。
          </>
        }
        confirmLabel="删除整集"
        confirmColor="error"
        busy={busy}
        onClose={() => setDeleteEpisodeTarget(null)}
        onConfirm={() => void confirmDeleteEpisode()}
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
