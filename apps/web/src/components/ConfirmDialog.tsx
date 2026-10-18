import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import type { ReactNode } from 'react'
import { TextInput } from './TextInput'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  confirmColor?: 'primary' | 'error' | 'warning' | 'success'
  requireText?: string
  busy?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  confirmColor = 'primary',
  requireText,
  busy = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) setText('')
  }, [open])

  const canConfirm = !requireText || text === requireText

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description ? (
          <DialogContentText component="div" sx={{ color: 'text.secondary' }}>
            {description}
          </DialogContentText>
        ) : null}
        {requireText ? (
          <div style={{ marginTop: 16 }}>
            <TextInput
              autoFocus
              label={`输入 ${requireText} 确认`}
              value={text}
              onChange={setText}
            />
          </div>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={onConfirm}
          disabled={!canConfirm || busy}
        >
          {busy ? '处理中…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
