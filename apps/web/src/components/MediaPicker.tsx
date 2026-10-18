import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import { Film, Image as ImageIcon, Upload, X } from 'lucide-react'
import { api, type UploadContext } from '../api'
import type { MediaAsset, MediaKind } from '../types'

type MediaPickerProps = {
  open: boolean
  projectId: string
  kind: MediaKind
  onClose: () => void
  onSelect: (asset: MediaAsset) => void
  uploadContext?: UploadContext
}

export function MediaPicker({
  open,
  projectId,
  kind,
  onClose,
  onSelect,
  uploadContext,
}: MediaPickerProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const mediaQuery = useQuery({
    queryKey: ['media', projectId, kind],
    queryFn: () => api.listMedia(projectId, { kind, limit: 300 }),
    enabled: open,
  })

  const items = (mediaQuery.data?.items ?? []).filter(
    (asset) => asset.status !== 'failed',
  )

  async function upload(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const asset = await api.uploadMedia(projectId, kind, file, uploadContext)
      await queryClient.invalidateQueries({ queryKey: ['media', projectId] })
      onSelect(asset)
      onClose()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          {kind === 'video' ? '选择视频' : '选择图片'}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            从项目文件库选择，或直接上传
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          startIcon={<Upload size={16} />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '上传中…' : '上传'}
        </Button>
        <IconButton size="small" onClick={onClose}>
          <X size={18} />
        </IconButton>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept={kind === 'video' ? 'video/*' : 'image/*'}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void upload(file)
          }}
        />
      </DialogTitle>
      <DialogContent>
        {uploadError ? (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            {uploadError}
          </Typography>
        ) : null}
        {mediaQuery.isLoading ? (
          <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              还没有{kind === 'video' ? '视频' : '图片'}
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Upload size={16} />}
              onClick={() => fileInputRef.current?.click()}
            >
              上传第一个文件
            </Button>
          </Box>
        ) : (
          <Box className="media-picker-grid">
            {items.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className="media-picker-card"
                onClick={() => {
                  if (asset.status !== 'ready') return
                  onSelect(asset)
                  onClose()
                }}
                disabled={asset.status !== 'ready'}
              >
                <div className="media-picker-thumb">
                  {asset.kind === 'image' && asset.thumbnailUrl ? (
                    <img src={asset.thumbnailUrl} alt={asset.displayName} />
                  ) : (
                    <Stack alignItems="center" spacing={0.5}>
                      {asset.kind === 'video' ? (
                        <Film size={30} color="var(--accent)" />
                      ) : (
                        <ImageIcon size={30} color="var(--blue)" />
                      )}
                    </Stack>
                  )}
                  {asset.status !== 'ready' ? (
                    <span className="media-picker-status">{asset.status}</span>
                  ) : null}
                </div>
                <div className="media-picker-name" title={asset.displayName}>
                  {asset.displayName}
                </div>
                <div className="media-picker-meta">
                  {asset.kind === 'video' ? '视频' : '图片'}
                  {asset.usageCount ? ` · ${asset.usageCount} 处使用` : ''}
                </div>
              </button>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}
