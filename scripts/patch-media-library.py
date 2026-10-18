from pathlib import Path

p = Path('apps/web/src/pages/MediaLibraryPage.tsx')
s = p.read_text(encoding='utf-8')

s = s.replace("""import {
  Button,
  CircularProgress,
  IconButton,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import MovieIcon from '@mui/icons-material/Movie'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { api, ApiError } from '../api'
import type { LinkedRow, MediaAsset } from '../types'
import { formatBytes } from '../utils'
import { MediaViewer } from '../components/MediaViewer'
import { ConfirmDialog } from '../components/ConfirmDialog'""",
"""import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from '@mui/material'
import { Download, Film, Pencil, Trash2, Upload } from 'lucide-react'
import { api, ApiError } from '../api'
import type { LinkedRow, MediaAsset } from '../types'
import { formatBytes } from '../utils'
import { MediaViewer } from '../components/MediaViewer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TextInput } from '../components/TextInput'""")

s = s.replace("""  const [viewer, setViewer] = useState<MediaAsset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    asset: MediaAsset
    details?: InUseDetails
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)""",
"""  const [viewer, setViewer] = useState<MediaAsset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    asset: MediaAsset
    details?: InUseDetails
  } | null>(null)
  const [cardMenu, setCardMenu] = useState<{
    x: number
    y: number
    asset: MediaAsset
  } | null>(null)
  const [renameTarget, setRenameTarget] = useState<MediaAsset | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)""")

s = s.replace("""  async function forceDelete() {""",
"""  function downloadAsset(asset: MediaAsset) {
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

  async function forceDelete() {""")

s = s.replace("""      <div className="page-header">
        <div>
          <div className="eyebrow">MEDIA LIBRARY</div>
          <Typography variant="h1" className="page-title">
            文件库
          </Typography>
          <Typography className="page-subtitle">
            项目内视频与图片。可被多行复用，删除后进入回收站。
          </Typography>
        </div>
        <div className="page-header-actions">
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '上传中…' : '上传文件'}
          </Button>""",
"""      <div className="page-header">
        <div>
          <Typography variant="h1" className="page-title">
            文件库
          </Typography>
        </div>
        <div className="page-header-actions">
          <Button
            variant="contained"
            startIcon={<Upload size={16} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '上传中…' : '上传文件'}
          </Button>""")

s = s.replace("""        <TextField
          size="small"
          placeholder="搜索文件名…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="library-search"
        />""",
"""        <TextInput
          placeholder="搜索文件名…"
          value={search}
          onChange={setSearch}
          className="library-search"
        />""")

s = s.replace("<MovieIcon sx={{ fontSize: 42, color: '#5b6b82' }} />",
              '<Film size={42} color="var(--muted-2)" />')
s = s.replace("<UploadFileIcon />", "<Upload size={16} />")

s = s.replace("""            <div
              key={asset.id}
              className="media-card"
              role="button"
              tabIndex={0}
              onClick={() => setViewer(asset)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setViewer(asset)
              }}
            >""",
"""            <div
              key={asset.id}
              className="media-card"
              role="button"
              tabIndex={0}
              onClick={() => setViewer(asset)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setViewer(asset)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setCardMenu({
                  x: event.clientX,
                  y: event.clientY,
                  asset,
                })
              }}
            >""")

s = s.replace("""                {asset.kind === 'image' && asset.thumbnailUrl ? (
                  <img src={asset.thumbnailUrl} alt={asset.displayName} />
                ) : (
                  <div className="video-placeholder">
                    <MovieIcon />
                    <span>{asset.kind === 'video' ? 'VIDEO' : 'IMAGE'}</span>
                  </div>
                )}""",
"""                {asset.kind === 'image' && asset.thumbnailUrl ? (
                  <img src={asset.thumbnailUrl} alt={asset.displayName} />
                ) : (
                  <div className="video-placeholder">
                    <Film size={36} />
                    <span>{asset.kind === 'video' ? 'VIDEO' : 'IMAGE'}</span>
                  </div>
                )}""")

s = s.replace("""              <Tooltip title="删除（进入回收站）">
                <IconButton
                  size="small"
                  className="media-card-delete"
                  onClick={(event) => {
                    event.stopPropagation()
                    void requestDelete(asset)
                  }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
""", "")

s = s.replace("""      <MediaViewer
        asset={viewer}
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
      />
""",
"""      <MediaViewer
        asset={viewer}
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
      />

      <Menu
        open={Boolean(cardMenu)}
        onClose={() => setCardMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          cardMenu ? { top: cardMenu.mouseY, left: cardMenu.mouseX } : undefined
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
""")

p.write_text(s, encoding='utf-8')
print('updated MediaLibraryPage')
