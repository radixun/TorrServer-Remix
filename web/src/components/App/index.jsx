import { createContext } from 'react'
import { CssBaseline } from '@material-ui/core'
import { createTheme, ThemeProvider as MuiThemeProvider } from '@material-ui/core/styles'
import { ThemeProvider } from 'styled-components'
import GlobalStyle from 'style/GlobalStyle'
import { darkTheme, THEME_MODES } from 'style/materialUISetup'
import getStyledComponentsTheme from 'style/getStyledComponentsTheme'
import Cinema from 'components/Cinema'
import 'assets/inter/400.css'
import 'assets/inter/600.css'

export const DarkModeContext = createContext({ isDarkMode: true })

const theme = createTheme({
  ...darkTheme,
  overrides: { ...darkTheme.overrides, MuiPaper: { root: { backgroundColor: '#202228' } } },
  typography: {
    ...darkTheme.typography,
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  palette: {
    ...darkTheme.palette,
    primary: { main: '#ededee', contrastText: '#101114' },
    secondary: { main: '#d6d7dc', contrastText: '#101114' },
    background: { default: '#101114', paper: '#202228' },
  },
})

export default function App() {
  return (
    <DarkModeContext.Provider value={{ isDarkMode: true }}>
      <MuiThemeProvider theme={theme}>
        <ThemeProvider theme={getStyledComponentsTheme(THEME_MODES.DARK)}>
          <GlobalStyle />
          <CssBaseline />
          <Cinema />
        </ThemeProvider>
      </MuiThemeProvider>
    </DarkModeContext.Provider>
  )
}
