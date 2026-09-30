import { mainColors, themeColors } from './colors'

export default type => ({
  ...themeColors[type],
  ...mainColors[type],
  accent: mainColors[type].primary,
  surface: mainColors[type].surface,
  // Keep the legacy styled-components token surface-safe until all consumers
  // migrate to theme.app.paperColor.
  primary: mainColors[type].surface,
})
