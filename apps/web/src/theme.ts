import { createTheme, type Theme } from '@mui/material/styles'

export type ThemeMode = 'dark' | 'light'

const fontFamily = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI Variable"',
  '"Segoe UI"',
  '"PingFang SC"',
  '"Microsoft YaHei UI"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
  'system-ui',
  'sans-serif',
].join(', ')

export function getTheme(mode: ThemeMode): Theme {
  const dark = mode === 'dark'

  return createTheme({
    palette: {
      mode,
      background: {
        default: dark ? '#0a0b0d' : '#f5f4f1',
        paper: dark ? '#111317' : '#ffffff',
      },
      primary: {
        main: dark ? '#e8ab5c' : '#a9661a',
        contrastText: dark ? '#1a1206' : '#ffffff',
      },
      secondary: {
        main: dark ? '#7aa7f7' : '#2f6fed',
      },
      error: {
        main: dark ? '#f07171' : '#c94f4b',
      },
      warning: {
        main: dark ? '#e8c05a' : '#9a6b06',
      },
      success: {
        main: dark ? '#64c98d' : '#2b8b58',
      },
      text: {
        primary: dark ? '#eceef2' : '#1d1f23',
        secondary: dark ? '#9ba1ab' : '#6e7076',
        disabled: dark ? '#6d747f' : '#8c8e94',
      },
      divider: dark ? '#262a31' : '#e0ddd6',
      action: {
        hover: dark ? 'rgba(255,255,255,0.04)' : 'rgba(29,31,35,0.045)',
        selected: dark ? 'rgba(232,171,92,0.12)' : 'rgba(169,102,26,0.1)',
        disabled: dark ? '#6d747f' : '#8c8e94',
        disabledBackground: dark
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(29,31,35,0.06)',
      },
    },
    typography: {
      fontFamily,
      fontSize: 14,
      h1: {
        fontSize: 26,
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: 0,
      },
      h2: {
        fontSize: 20,
        fontWeight: 600,
        lineHeight: 1.35,
        letterSpacing: 0,
      },
      h3: { fontSize: 16, fontWeight: 600, lineHeight: 1.4 },
      h4: { fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
      h5: { fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
      h6: { fontSize: 14, fontWeight: 600, lineHeight: 1.4 },
      subtitle1: { fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
      subtitle2: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
      body1: { fontSize: 14, lineHeight: 1.6 },
      body2: { fontSize: 12, lineHeight: 1.65 },
      button: {
        textTransform: 'none',
        fontWeight: 600,
        fontSize: 13,
        letterSpacing: 0,
      },
      caption: { fontSize: 11, lineHeight: 1.5 },
      overline: { fontSize: 10, letterSpacing: '0.08em', fontWeight: 500 },
    },
    shape: {
      borderRadius: 8,
    },
    transitions: {
      duration: {
        shortest: 120,
        shorter: 140,
        short: 160,
        standard: 180,
        complex: 220,
        enteringScreen: 180,
        leavingScreen: 140,
      },
      easing: {
        easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easeOut: 'cubic-bezier(0.2, 0, 0, 1)',
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
        sharp: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 'var(--radius-md)',
            paddingInline: 14,
            minHeight: 34,
            lineHeight: 1.4,
          },
          sizeSmall: {
            minHeight: 30,
            paddingInline: 12,
            fontSize: 12,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--radius-md)',
            color: 'var(--muted)',
            '&:hover': {
              backgroundColor: 'var(--hover)',
              color: 'var(--text)',
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-2xl)',
            boxShadow: 'var(--shadow-pop)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: 16,
            fontWeight: 600,
            padding: '20px 24px 8px',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: '8px 24px',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '12px 24px 20px',
            gap: 8,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: 'var(--panel-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-pop)',
            padding: 4,
            minWidth: 160,
          },
          list: {
            padding: 0,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--radius-sm)',
            minHeight: 34,
            fontSize: 13,
            gap: 8,
            padding: '6px 10px',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: 'var(--panel-2)',
            border: '1px solid var(--line)',
            color: 'var(--text)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-float)',
            fontSize: 11,
            padding: '5px 8px',
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--panel-2)',
            color: 'var(--text)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-float)',
            fontSize: 12,
            minWidth: 0,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--radius-lg)',
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
