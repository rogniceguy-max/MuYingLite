import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { ArrowRight, Plus } from 'lucide-react'
import { api } from '../api'
import { TextInput } from '../components/TextInput'
import { ThemeToggle } from '../components/ThemeToggle'

export function ProjectListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: api.listProjects,
  })

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [episodeNumber, setEpisodeNumber] = useState('1')
  const [episodeTitle, setEpisodeTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createProject() {
    setBusy(true)
    setError(null)
    try {
      const result = await api.createProject(name.trim(), {
        number: Number(episodeNumber),
        title: episodeTitle.trim() || null,
      })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      const firstSheet =
        result.sheets.find((sheet) => sheet.kind === 'beat') ??
        result.sheets.find((sheet) => sheet.kind === 'asset')
      setOpen(false)
      setName('')
      setEpisodeNumber('1')
      setEpisodeTitle('')
      navigate(
        firstSheet
          ? `/projects/${result.project.id}/sheets/${firstSheet.id}`
          : `/projects/${result.project.id}`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const projects = projectsQuery.data ?? []

  return (
    <div className="project-list-page">
      <header className="project-list-header">
        <div className="brand brand-large">
          <div className="brand-mark">沐</div>
          <div>
            <div className="brand-name">沐影库</div>
          </div>
        </div>
        <div className="project-list-header-actions">
          <ThemeToggle />
        </div>
      </header>

      <section className="project-list-section">
        <div className="section-heading">
          <span>项目</span>
          <span className="section-count">{projects.length}</span>
        </div>

        {projectsQuery.isLoading ? (
          <div className="page-loading">
            <CircularProgress size={28} />
            <Typography color="text.secondary">载入项目…</Typography>
          </div>
        ) : projects.length === 0 ? (
          <div className="project-empty">
            <div className="brand-mark brand-mark-empty">沐</div>
            <Typography variant="h2">还没有项目</Typography>
            <Button
              variant="outlined"
              startIcon={<Plus size={16} />}
              onClick={() => setOpen(true)}
            >
              创建第一个项目
            </Button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <button
                type="button"
                key={project.id}
                className="project-card"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="project-card-name">{project.name}</div>
                <div className="project-card-meta">
                  {project.episodeCount} 集
                </div>
                <div className="project-card-footer">
                  <span>进入项目</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            ))}
            <button
              type="button"
              className="project-card project-card-new"
              onClick={() => setOpen(true)}
            >
              <Plus size={20} />
              <span>新建项目</span>
            </button>
          </div>
        )}
      </section>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>新建项目</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            会自动创建第 1 集的 8 行节拍表，以及一张项目资产表。
          </Typography>
          <div className="field-block">
            <TextInput
              autoFocus
              label="项目名称"
              value={name}
              onChange={setName}
            />
          </div>
          <div className="dialog-grid">
            <TextInput
              label="第一集集号"
              type="number"
              value={episodeNumber}
              onChange={setEpisodeNumber}
            />
            <TextInput
              label="第一集标题（可选）"
              value={episodeTitle}
              onChange={setEpisodeTitle}
            />
          </div>
          {error ? (
            <Typography color="error" variant="body2" sx={{ mt: 2 }}>
              {error}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void createProject()}
            disabled={busy || !name.trim() || !episodeNumber}
          >
            {busy ? '创建中…' : '创建项目'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
