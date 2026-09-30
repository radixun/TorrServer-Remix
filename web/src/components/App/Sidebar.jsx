import Divider from '@material-ui/core/Divider'
import List from '@material-ui/core/List'
import AddDialogButton from 'components/Add'
import SettingsDialog from 'components/Settings'
import CloseServer from 'components/CloseServer'
import SearchDialogButton from 'components/Search'
import { memo } from 'react'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ListItem from '@material-ui/core/ListItem'
import ExploreIcon from '@material-ui/icons/Explore'
import ListIcon from '@material-ui/icons/List'
import { useTranslation } from 'react-i18next'

import { AppSidebarStyle } from './style'

const Sidebar = ({ isDrawerOpen, isOffline, isLoading, activeView, setActiveView }) => {
  const { t } = useTranslation()

  return (
    <AppSidebarStyle id='app-navigation' isDrawerOpen={isDrawerOpen}>
      <List>
        <ListItem
          button
          onClick={() => setActiveView(activeView === 'discover' ? 'library' : 'discover')}
          title={activeView === 'discover' ? t('Discovery.Library') : t('Discovery.Title')}
          aria-label={activeView === 'discover' ? t('Discovery.Library') : t('Discovery.Title')}
        >
          <ListItemIcon>{activeView === 'discover' ? <ListIcon /> : <ExploreIcon />}</ListItemIcon>
          <ListItemText primary={activeView === 'discover' ? t('Discovery.Library') : t('Discovery.Title')} />
        </ListItem>

        <AddDialogButton isOffline={isOffline} isLoading={isLoading} />
        <SearchDialogButton isOffline={isOffline} isLoading={isLoading} />
      </List>

      <Divider />

      <List>
        <SettingsDialog isOffline={isOffline} isLoading={isLoading} />
        <CloseServer isOffline={isOffline} isLoading={isLoading} />
      </List>
    </AppSidebarStyle>
  )
}

export default memo(Sidebar)
