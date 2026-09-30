import CloseServer from 'components/CloseServer'
import AddDialogButton from 'components/Add'
import SettingsDialogButton from 'components/Settings'

import StyledPWAFooter from './style'

export default function PWAFooter({ isOffline, isLoading }) {
  return (
    <StyledPWAFooter>
      <CloseServer isOffline={isOffline} isLoading={isLoading} />

      <AddDialogButton isOffline={isOffline} isLoading={isLoading} />

      <SettingsDialogButton isOffline={isOffline} isLoading={isLoading} />
    </StyledPWAFooter>
  )
}
