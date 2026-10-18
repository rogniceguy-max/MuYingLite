import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { CheckCircle, Maximize, X } from 'lucide-react'
import type { MediaAsset } from '../types'

type MediaViewerProps = {
  asset: MediaAsset | null
  open: boolean
  onClose: () => void
  onSetSelected?: () => void
  setSelectedLabel?: string
}

function clampPanValues(
  image: HTMLImageElement,
  rect: DOMRect,
  x: number,
  y: number,
  zoom: number,
) {
  const maxX = Math.max(0, (image.offsetWidth * zoom - rect.width) / 2)
  const maxY = Math.max(0, (image.offsetHeight * zoom - rect.height) / 2)
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`
}

export function MediaViewer({
  asset,
  open,
  onClose,
  onSetSelected,
  setSelectedLabel = '设为选定',
}: MediaViewerProps) {
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [speed, setSpeed] = useState(1)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)

  useEffect(() => {
    if (open) {
      setView({ zoom: 1, x: 0, y: 0 })
      setDragging(false)
      dragRef.current = null
      setSpeed(1)
    }
  }, [open, asset?.id])

  function clampPan(
    x: number,
    y: number,
    zoom: number,
    stageRect?: DOMRect,
  ) {
    const stage = stageRef.current
    const image = imageRef.current
    if (!stage || !image) return { x: 0, y: 0 }
    return clampPanValues(
      image,
      stageRect ?? stage.getBoundingClientRect(),
      x,
      y,
      zoom,
    )
  }

  const onNativeWheel = useCallback((event: WheelEvent) => {
    event.preventDefault()
    const stage = stageRef.current
    const image = imageRef.current
    if (!stage || !image) return
    const rect = stage.getBoundingClientRect()
    const mouseX = event.clientX - (rect.left + rect.width / 2)
    const mouseY = event.clientY - (rect.top + rect.height / 2)
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    setView((previous) => {
      const zoom = Math.min(4, Math.max(0.25, previous.zoom * factor))
      if (zoom === previous.zoom) return previous
      const ratio = zoom / previous.zoom
      const pan = clampPanValues(
        image,
        rect,
        mouseX - (mouseX - previous.x) * ratio,
        mouseY - (mouseY - previous.y) * ratio,
        zoom,
      )
      return { zoom, x: pan.x, y: pan.y }
    })
  }, [])

  const setStageNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (stageRef.current && stageRef.current !== node) {
        stageRef.current.removeEventListener('wheel', onNativeWheel)
      }
      stageRef.current = node
      if (node) {
        node.addEventListener('wheel', onNativeWheel, { passive: false })
      }
    },
    [onNativeWheel],
  )

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (view.zoom <= 1) return
    const stage = stageRef.current
    if (!stage) return
    event.preventDefault()
    stage.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: view.x,
      panY: view.y,
    }
    setDragging(true)
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const pan = clampPan(
      drag.panX + (event.clientX - drag.startX),
      drag.panY + (event.clientY - drag.startY),
      view.zoom,
      rect,
    )
    setView((previous) => ({ ...previous, x: pan.x, y: pan.y }))
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    const stage = stageRef.current
    if (stage?.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId)
    }
  }

  function changeSpeed(next: number) {
    setSpeed(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  async function enterFullscreen() {
    try {
      await videoRef.current?.requestFullscreen()
    } catch {
      // ignore
    }
  }

  if (!asset) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: 'var(--panel)',
          backgroundImage: 'none',
          border: '1px solid var(--line)',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>
            {asset.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {asset.kind === 'video' ? '视频' : '图片'} · {formatBytes(asset.sizeBytes)}
            {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
          </Typography>
        </Box>
        {onSetSelected ? (
          <Button
            variant="contained"
            size="small"
            startIcon={<CheckCircle size={16} />}
            onClick={onSetSelected}
          >
            {setSelectedLabel}
          </Button>
        ) : null}
        <IconButton onClick={onClose} size="small">
          <X size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {asset.kind === 'image' ? (
          <Box
            ref={setStageNode}
            className="media-image-stage"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={() => {
              dragRef.current = null
              setDragging(false)
            }}
            onDoubleClick={() => setView({ zoom: 1, x: 0, y: 0 })}
            title="滚轮缩放 · 拖动平移 · 双击重置"
            sx={{
              maxHeight: '72vh',
              overflow: 'hidden',
              borderRadius: 2,
              backgroundColor: 'var(--media-stage)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor:
                view.zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            <img
              ref={imageRef}
              src={asset.originalUrl ?? ''}
              alt={asset.displayName}
              draggable={false}
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                transformOrigin: 'center center',
                maxWidth: '100%',
                maxHeight: '70vh',
                transition: dragging ? 'none' : 'transform 120ms ease',
                display: 'block',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          </Box>
        ) : (
          <Box>
            <video
              ref={videoRef}
              src={asset.originalUrl ?? ''}
              controls
              autoPlay
              playsInline
              style={{
                width: '100%',
                maxHeight: '72vh',
                backgroundColor: '#000',
                borderRadius: 10,
              }}
            />
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 1.5, flexWrap: 'wrap' }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                倍速
              </Typography>
              {[0.5, 1, 1.5, 2].map((rate) => (
                <Button
                  key={rate}
                  size="small"
                  variant={speed === rate ? 'contained' : 'outlined'}
                  color={speed === rate ? 'primary' : 'inherit'}
                  onClick={() => changeSpeed(rate)}
                  sx={{ minWidth: 52 }}
                >
                  {rate}×
                </Button>
              ))}
              <Tooltip title="全屏">
                <IconButton size="small" onClick={enterFullscreen}>
                  <Maximize size={18} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        )}
        {asset.status !== 'ready' ? (
          <Typography variant="body2" color="warning.main" sx={{ mt: 2 }}>
            媒体状态：{asset.status}
            {asset.processingError ? ` · ${asset.processingError}` : ''}
          </Typography>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
