import { createTheme, useMediaQuery } from '@material-ui/core'
import { useMemo, useState } from 'react'

import { mainColors, themeColors } from './colors'

export const THEME_MODES = { LIGHT: 'light', DARK: 'dark', AUTO: 'auto' }

const typography = {
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const createMaterialTheme = theme => {
  const { app } = themeColors[theme]
  const colors = mainColors[theme]

  return createTheme({
    typography,
    palette: {
      type: theme,
      primary: { main: colors.primary, contrastText: colors.contrastText },
      secondary: { main: colors.secondary, contrastText: colors.contrastText },
      background: { default: app.contentBGColor, paper: app.paperColor },
      text: { primary: app.textColor, secondary: app.mutedTextColor },
      divider: app.borderColor,
      action: {
        hover: app.hoverBGColor,
        selected: app.hoverBGColor,
        disabled: theme === THEME_MODES.DARK ? 'rgba(232, 242, 251, 0.38)' : 'rgba(17, 24, 39, 0.38)',
        disabledBackground: theme === THEME_MODES.DARK ? 'rgba(232, 242, 251, 0.12)' : 'rgba(17, 24, 39, 0.12)',
      },
    },
    overrides: {
      MuiTypography: {
        h6: {
          fontSize: '1.0rem',
        },
      },
      MuiPaper: {
        root: {
          backgroundColor: app.paperColor,
        },
      },
      MuiInputBase: {
        input: {
          color: colors.labels,
        },
      },
      // https://material-ui.com/ru/api/form-control-label/
      MuiFormControlLabel: {
        labelPlacementStart: {
          display: 'flex',
          justifyContent: 'space-between',
          marginInlineStart: 0,
          marginLeft: 0,
          marginRight: 0,
          marginTop: 6,
          marginBottom: 2,
        },
      },
      MuiInputLabel: {
        root: {
          color: colors.labels,
          marginBottom: 8,
          '&$focused': {
            color: colors.primary,
          },
        },
      },
      MuiFormGroup: {
        root: {
          '& .MuiFormHelperText-root': {
            marginTop: -8,
          },
        },
      },
    },
  })
}

export const darkTheme = createMaterialTheme(THEME_MODES.DARK)
export const lightTheme = createMaterialTheme(THEME_MODES.LIGHT)

export const useMaterialUITheme = () => {
  const savedThemeMode = localStorage.getItem('themeMode')
  const initialThemeMode = Object.values(THEME_MODES).includes(savedThemeMode) ? savedThemeMode : THEME_MODES.AUTO
  const isSystemModeDark = useMediaQuery('(prefers-color-scheme: dark)', {
    noSsr: true,
  })
  const [currentThemeMode, setCurrentThemeMode] = useState(initialThemeMode)

  const updateThemeMode = mode => {
    setCurrentThemeMode(mode)
    localStorage.setItem('themeMode', mode)
  }

  const isDarkMode =
    currentThemeMode === THEME_MODES.DARK || (currentThemeMode === THEME_MODES.AUTO && isSystemModeDark)

  const theme = isDarkMode ? THEME_MODES.DARK : THEME_MODES.LIGHT

  const muiTheme = useMemo(() => createMaterialTheme(theme), [theme])

  return [isDarkMode, currentThemeMode, updateThemeMode, muiTheme]
}
