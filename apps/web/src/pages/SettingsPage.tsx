import { useEffect, useMemo, useState } from 'react'
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
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import type { Episode, Sheet } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TextInput } from '../components/TextInput'

type EpisodeDialogState = {
  episode?: Episode
  number: string
  title: string
}

export function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  })

  const [projectName, setProjectName] = useState('')
  const [episodeDialog, setEpisodeDialog] = useState<EpisodeDialogState | null>(
    null,
  )
  const [deleteEpisodeTarget, setDeleteEpisodeTarget] =
    useState<Episode | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (projectQuery.data?.project.name) {
      setProjectName(projectQuery.data.project.name)
    }
  }, [projectQuery.data?.project.name])

  const data = projectQuery.data
  const episodes = useMemo(
    () =>
      [...(data?.episodes ?? [])].sort(
        (a, b) => a.position - b.position || a.number - b.number,
      ),
    [data?.episodes],
  )
  const activeEpisodes = episodes.filter((episode) => !episode.deletedAt)
  const sheets = useMemo(
    () =>
      [...(data?.sheets ?? [])].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'beat' ? -1 : 1
        return (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)
      }),
    [data?.sheets],
  )

  function beatSheetFor(episodeId: string): Sheet | undefined {
    return sheets.find(
      (sheet) => sheet.kind === 'beat' && sheet.episodeId === episodeId,
    )
  }

  function nextEpisodeNumber(): number {
    return episodes.reduce((max, episode) => Math.max(max, episode.number), 0) + 1
  }

  async function saveProjectName() {
    if (!projectId || !projectName.trim()) return
    setBusy(true)
    try {
      await api.updateProject(projectId, projectName.trim())
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setToast('项目名已更新')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
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
        setToast('集信息已更新')
      } else {
        await api.createEpisode(
          projectId,
          Number(episodeDialog.number),
          episodeDialog.title.trim() || null,
        )
        setToast('已新增一集，并创建 8 行节拍表')
      }
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setEpisodeDialog(null)
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteEpisode() {
    if (!deleteEpisodeTarget || !projectId) return
    setBusy(true)
    try {
      await api.deleteEpisode(deleteEpisodeTarget.id)
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['recycle', projectId] })
      setDeleteEpisodeTarget(null)
      setToast('整集已移入回收站')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  if (projectQuery.isLoading || !data) {
    return (
      <div className="page-loading">
        <CircularProgress size={28} />
        <Typography color="text.secondary">载入设置…</Typography>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <section className="settings-section">
        <div className="settings-section-title">项目</div>
        <div className="settings-card">
          <div className="settings-inline-form">
            <TextInput
              label="项目名"
              value={projectName}
              onChange={setProjectName}
            />
            <Button
              variant="contained"
              onClick={() => void saveProjectName()}
              disabled={busy || !projectName.trim() || projectName.trim() === data.project.name}
            >
              保存
            </Button>
          </div>
          <div className="settings-hint">
            当前项目共 {activeEpisodes.length} 集。
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">
          <span>集</span>
          <Button
            size="small"
            startIcon={<Plus size={16} />}
            onClick={() => {
              setDialogError(null)
              setEpisodeDialog({
                number: String(nextEpisodeNumber()),
                title: '',
              })
            }}
          >
            新增集
          </Button>
        </div>
        <div className="settings-card settings-list">
          {episodes.length === 0 ? (
            <div className="settings-empty">还没有集</div>
          ) : (
            episodes.map((episode) => {
              const beatSheet = beatSheetFor(episode.id)
              return (
                <div
                  key={episode.id}
                  className={`settings-row ${
                    episode.deletedAt ? 'is-deleted' : ''
                  }`}
                >
                  <div className="settings-row-main">
                    <div className="settings-episode-title">
                      第{episode.number}集
                      {episode.title ? ` · ${episode.title}` : ''}
                      {episode.deletedAt ? '（已删除）' : ''}
                    </div>
                  </div>
                  <div className="settings-row-actions">
                    <Tooltip title="编辑集">
                      <span>
                        <IconButton
                          size="small"
                          disabled={Boolean(episode.deletedAt)}
                          onClick={() => {
                            setDialogError(null)
                            setEpisodeDialog({
                              episode,
                              number: String(episode.number),
                              title: episode.title ?? '',
                            })
                          }}
                        >
                          <Pencil size={15} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="删除整集">
                      <span>
                        <IconButton
                          size="small"
                          disabled={Boolean(episode.deletedAt)}
                          onClick={() => setDeleteEpisodeTarget(episode)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

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
