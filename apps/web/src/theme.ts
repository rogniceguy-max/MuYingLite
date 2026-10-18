import { createTheme, type Theme } from '@mui/material/styles'

export type ThemeMode = 'dark' | 'light'

export function getTheme(mode: ThemeMode): Theme {
  const dark = mode === 'dark'

  return createTheme({
    palette: {
      mode,
      background: {
        default: dark ? '#0b0e14' : '#f4f5f7',
        paper: dark ? '#111822' : '#ffffff',
      },
      primary: {
        main: dark ? '#f2b35c' : '#b9721c',
        contrastText: dark ? '#17120a' : '#ffffff',
      },
      secondary: {
        main: dark ? '#6aa7ff' : '#2f6fed',
      },
      error: {
        main: dark ? '#ff6b6b' : '#d9534f',
      },
      warning: {
        main: dark ? '#f2c14e' : '#b8860b',
      },
      success: {
        main: dark ? '#58d68d' : '#2e9e63',
      },
      text: {
        primary: dark ? '#e9eff8' : '#1b2430',
        secondary: dark ? '#98a5b8' : '#6b7788',
      },
      divider: dark ? '#243042' : '#dfe3e9',
    },
    typography: {
      fontFamily:
        '"Inter", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
      button: {
        textTransform: 'none',
        fontWeight: 600,
      },
      h1: {
        fontSize: 30,
        fontWeight: 700,
        letterSpacing: '-0.02em',
      },
      h2: {
        fontSize: 22,
        fontWeight: 700,
      },
      body2: {
        color: dark ? '#98a5b8' : '#6b7788',
      },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 8,
            paddingInline: 16,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            border: '1px solid var(--line)',
            backgroundColor: 'var(--panel)',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: 'var(--panel-2)',
            border: '1px solid var(--line)',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: 'var(--panel-2)',
            border: '1px solid var(--line)',
            color: 'var(--text)',
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: 'var(--muted-2)',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--input-bg)',
            '& fieldset': {
              borderColor: 'var(--line-strong)',
            },
            '&:hover fieldset': {
              borderColor: 'var(--muted-2)',
            },
          },
        },
      },
    },
  })
}
