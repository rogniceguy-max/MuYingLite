import { IconButton, Tooltip } from '@mui/material'
import { Moon, Sun } from 'lucide-react'
import { useThemeMode } from '../theme-mode'

export function ThemeToggle() {
  const { mode, toggle } = useThemeMode()
  return (
    <Tooltip title={mode === 'dark' ? '切换浅色主题' : '切换深色主题'}>
      <IconButton
        size="small"
        onClick={toggle}
        aria-label={mode === 'dark' ? '切换浅色主题' : '切换深色主题'}
      >
        {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </IconButton>
    </Tooltip>
  )
}
