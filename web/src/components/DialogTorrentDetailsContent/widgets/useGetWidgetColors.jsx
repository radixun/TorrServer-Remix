import { DarkModeContext } from 'components/App'
import { useContext } from 'react'
import { THEME_MODES } from 'style/materialUISetup'

const { LIGHT, DARK } = THEME_MODES

const colors = {
  light: {
    downloadSpeed: { iconBGColor: '#007f73', valueBGColor: '#009688' },
    uploadSpeed: { iconBGColor: '#2f5f98', valueBGColor: '#3974b8' },
    peers: { iconBGColor: '#8a7a15', valueBGColor: '#a38f16' },
    piecesCount: { iconBGColor: '#5e7a7a', valueBGColor: '#71908f' },
    piecesLength: { iconBGColor: '#346f86', valueBGColor: '#4087a3' },
    status: { iconBGColor: '#69717c', valueBGColor: '#7d8794' },
    size: { iconBGColor: '#7b4b93', valueBGColor: '#925ab0' },
    category: { iconBGColor: '#9a5c2f', valueBGColor: '#b76f39' },
  },
  dark: {
    downloadSpeed: { iconBGColor: '#0c6600', valueBGColor: '#0d7000' },
    uploadSpeed: { iconBGColor: '#003f9e', valueBGColor: '#0047b3' },
    peers: { iconBGColor: '#a69c11', valueBGColor: '#b4a913' },
    piecesCount: { iconBGColor: '#8da136', valueBGColor: '#99ae3d' },
    piecesLength: { iconBGColor: '#07659c', valueBGColor: '#0872af' },
    status: { iconBGColor: '#938948', valueBGColor: '#9f9450' },
    size: { iconBGColor: '#81008f', valueBGColor: '#9102a1' },
    category: { iconBGColor: '#914820', valueBGColor: '#c9632c' },
  },
}

export default function useGetWidgetColors(widgetName) {
  const { isDarkMode } = useContext(DarkModeContext)
  const widgetColors = colors[isDarkMode ? DARK : LIGHT][widgetName]

  return widgetColors
}
