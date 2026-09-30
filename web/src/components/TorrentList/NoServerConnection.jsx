import CloudOffIcon from '@material-ui/icons/CloudOff'
import { useTranslation } from 'react-i18next'

import IconWrapper from './style'

export default function NoServerConnection() {
  const { t } = useTranslation()
  return (
    <IconWrapper role='status' aria-live='polite'>
      <CloudOffIcon className='empty-state-icon' aria-hidden='true' />
      <div className='icon-label'>{t('Offline')}</div>
    </IconWrapper>
  )
}
