import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CircularProgress, Typography } from '@mui/material'
import { ArrowRight, Clapperboard } from 'lucide-react'
import { api } from '../api'
import { ThemeToggle } from '../components/ThemeToggle'

export function ProjectListPage() {
  const navigate = useNavigate()
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: api.listProjects,
  })

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
            <Clapperboard size={28} color="var(--accent)" />
            <Typography variant="h2">还没有项目</Typography>
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
          </div>
        )}
      </section>
    </div>
  )
}
