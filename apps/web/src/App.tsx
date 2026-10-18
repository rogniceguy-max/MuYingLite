import { Route, Routes } from 'react-router-dom'
import { Button, Typography } from '@mui/material'
import { ProjectListPage } from './pages/ProjectListPage'
import { ProjectWorkspace } from './pages/ProjectWorkspace'
import { ProjectRedirect } from './pages/ProjectRedirect'
import { SheetPage } from './pages/SheetPage'
import { MediaLibraryPage } from './pages/MediaLibraryPage'
import { RecycleBinPage } from './pages/RecycleBinPage'
import { SettingsPage } from './pages/SettingsPage'

function NotFound() {
  return (
    <div className="page-error">
      <Typography variant="h4">页面不存在</Typography>
      <Button variant="outlined" href="/" sx={{ mt: 2 }}>
        返回项目列表
      </Button>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectListPage />} />
      <Route path="/projects/:projectId" element={<ProjectWorkspace />}>
        <Route index element={<ProjectRedirect />} />
        <Route path="sheets/:sheetId" element={<SheetPage />} />
        <Route path="media" element={<MediaLibraryPage />} />
        <Route path="recycle-bin" element={<RecycleBinPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
