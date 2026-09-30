import AddCircleOutlineIcon from '@material-ui/icons/AddCircleOutline'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import AddDialog from '../Add/AddDialog'
import IconWrapper from './style'

export default function AddFirstTorrent() {
  const { t } = useTranslation()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const handleClickOpen = () => setIsDialogOpen(true)
  const handleClose = () => setIsDialogOpen(false)
  const label = `${t('Add')}: ${t('NoTorrentsAdded')}`

  return (
    <>
      <IconWrapper as='button' type='button' onClick={handleClickOpen} $isButton title={label} aria-label={label}>
        <AddCircleOutlineIcon className='empty-state-icon' aria-hidden='true' />
        <div className='icon-label'>{t('NoTorrentsAdded')}</div>
      </IconWrapper>

      {isDialogOpen && <AddDialog handleClose={handleClose} />}
    </>
  )
}
