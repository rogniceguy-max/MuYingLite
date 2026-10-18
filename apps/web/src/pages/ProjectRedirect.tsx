import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CircularProgress, Typography } from '@mui/material'
import { api } from '../api'

export function ProjectRedirect() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: Boolean(projectId),
  })

  useEffect(() => {
    if (!projectQuery.data) return
    const target =
      projectQuery.data.sheets.find((sheet) => sheet.kind === 'beat') ??
      projectQuery.data.sheets.find((sheet) => sheet.kind === 'asset')
    if (target) {
      navigate(`/projects/${projectId}/sheets/${target.id}`, { replace: true })
    }
  }, [projectQuery.data, navigate, projectId])

  if (projectQuery.error) {
    return (
      <div className="page-error">
        <Typography variant="h5">项目不存在</Typography>
      </div>
    )
  }

  return (
    <div className="page-loading page-loading-full">
      <CircularProgress size={28} />
      <Typography color="text.secondary">正在打开项目…</Typography>
    </div>
  )
}
