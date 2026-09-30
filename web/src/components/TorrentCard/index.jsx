import { forwardRef, memo, useEffect, useState } from 'react'
import { PlayArrow as PlayArrowIcon, Delete as DeleteIcon } from '@material-ui/icons'
import { humanizeSize, removeRedundantCharacters } from 'utils/Utils'
import { streamHost, torrentsHost } from 'utils/Hosts'
import { NoImageIcon } from 'icons'
import DialogTorrentDetailsContent from 'components/DialogTorrentDetailsContent'
import Dialog from '@material-ui/core/Dialog'
import Slide from '@material-ui/core/Slide'
import { Button, DialogActions, DialogTitle, useMediaQuery, useTheme } from '@material-ui/core'
import axios from 'axios'
import ptt from 'parse-torrent-title'
import { useTranslation } from 'react-i18next'
import AddDialog from 'components/Add/AddDialog'
import { StyledDialog } from 'style/CustomMaterialUiStyles'
import useOnStandaloneAppOutsideClick from 'utils/useOnStandaloneAppOutsideClick'
import { GETTING_INFO, IN_DB, CLOSED, PRELOAD, WORKING } from 'torrentStates'
import { TORRENT_CATEGORIES } from 'components/categories'
import VideoPlayer from 'components/VideoPlayer'
import { isFilePlayable } from 'components/DialogTorrentDetailsContent/helpers'

import {
  StatusIndicators,
  StyledButton,
  TorrentCard,
  TorrentCardButtons,
  TorrentCardDescription,
  TorrentCardPoster,
} from './style'

const Transition = forwardRef((props, ref) => <Slide direction='up' ref={ref} {...props} />)

const Torrent = ({ torrent, genreMaps }) => {
  const { t } = useTranslation()
  const [isDetailedInfoOpened, setIsDetailedInfoOpened] = useState(false)
  const [isDeleteTorrentOpened, setIsDeleteTorrentOpened] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  const [posterFailed, setPosterFailed] = useState(false)

  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'))

  const openDetailedInfo = () => setIsDetailedInfoOpened(true)
  const closeDetailedInfo = () => setIsDetailedInfoOpened(false)
  const openDeleteTorrentAlert = () => setIsDeleteTorrentOpened(true)
  const closeDeleteTorrentAlert = () => setIsDeleteTorrentOpened(false)

  const { title, name, category, poster, torrent_size: torrentSize, hash, stat, data } = torrent

  useEffect(() => setPosterFailed(false), [poster])

  const deleteTorrent = () => axios.post(torrentsHost(), { action: 'rem', hash })

  const getParsedTitle = () => {
    const parse = key => ptt.parse(String(title || ''))?.[key] || ptt.parse(String(name || ''))?.[key]

    const titleStrings = []

    let parsedTitle = removeRedundantCharacters(parse('title') || String(title || name || ''))
    const parsedYear = parse('year')
    const parsedResolution = parse('resolution')
    if (parsedTitle) titleStrings.push(parsedTitle)
    if (parsedYear) titleStrings.push(`(${parsedYear})`)
    if (parsedResolution) titleStrings.push(`[${parsedResolution}]`)
    parsedTitle = titleStrings.join(' ')
    return { parsedTitle }
  }
  const { parsedTitle } = getParsedTitle()
  const torrServerData = getTorrServerData(data)
  const metadata = torrServerData.Metadata || {}
  const tmdbMetadata = metadata?.tmdb || metadata?.TMDB || {}
  const genreMap = genreMaps?.[tmdbMetadata.media_type || category] || {}
  const genres = (tmdbMetadata.genre_ids || tmdbMetadata.GenreIDs || [])
    .map(id => genreMap[String(id)])
    .filter(Boolean)
    .slice(0, 3)

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const handleClickOpenEditDialog = () => setIsEditDialogOpen(true)
  const handleCloseEditDialog = () => setIsEditDialogOpen(false)

  const detailedInfoDialogRef = useOnStandaloneAppOutsideClick(closeDetailedInfo)
  // main categories
  const catIndex = TORRENT_CATEGORIES.findIndex(e => e.key === category)
  const catArray = TORRENT_CATEGORIES.find(e => e.key === category)
  const getFileLink = (path, id) =>
    `${streamHost()}/${encodeURIComponent(path.split('\\').pop().split('/').pop())}?link=${hash}&index=${id}&play`

  const fileList = Array.isArray(torrServerData.Files) ? torrServerData.Files : []
  const playableVideoList = fileList.filter(file => file && isFilePlayable(file.path))
  const getVideoCaption = path => {
    // Get base name without extension
    const baseName = path.replace(/\.[^/.]+$/, '')
    // Find a file with the same base name and a subtitle extension
    const captionFile = fileList.find(
      file => typeof file.path === 'string' && file.path.startsWith(baseName) && /\.(srt|vtt)$/i.test(file.path),
    )
    return captionFile ? getFileLink(captionFile.path, captionFile.id) : ''
  }
  const hasPoster = !!poster && !posterFailed
  const displayTitle = parsedTitle || title || name || t('Name')
  return (
    <>
      <TorrentCard>
        <TorrentCardPoster
          type='button'
          $hasPoster={hasPoster}
          onClick={handleClickOpenEditDialog}
          title={`${t('Edit')}: ${displayTitle}`}
          aria-label={`${t('Edit')}: ${displayTitle}`}
        >
          {hasPoster ? (
            <img src={poster} alt={displayTitle} onError={() => setPosterFailed(true)} draggable='false' />
          ) : (
            <NoImageIcon aria-hidden='true' />
          )}
        </TorrentCardPoster>

        <TorrentCardButtons>
          {playableVideoList?.length === 1 && isSupported ? (
            <VideoPlayer
              title={title}
              videoSrc={getFileLink(playableVideoList[0].path, playableVideoList[0].id)}
              captionSrc={getVideoCaption(playableVideoList[0].path)}
              onNotSupported={() => setIsSupported(false)}
            />
          ) : (
            <StyledButton onClick={openDetailedInfo}>
              <PlayArrowIcon />
              <span>{t('Watch')}</span>
            </StyledButton>
          )}

          <StyledButton $variant='delete' onClick={openDeleteTorrentAlert} aria-label={t('Delete')} title={t('Delete')}>
            <DeleteIcon />
          </StyledButton>
        </TorrentCardButtons>

        <TorrentCardDescription>
          <div className='description-title-wrapper'>
            <div className='description-section-name'>
              {category ? (catIndex >= 0 ? t(catArray.name) : category) : t('Name')}
            </div>
            <div className='description-torrent-title'>{parsedTitle}</div>
          </div>

          <div className='description-statistics-wrapper'>
            <div className='description-statistics-element-wrapper'>
              <div className='description-section-name'>
                <StatusIndicator stat={stat} />
                {t('Size')}
              </div>
              <div className='description-statistics-element-value'>{torrentSize > 0 && humanizeSize(torrentSize)}</div>
            </div>
            {genres.length > 0 && (
              <div className='description-genres' aria-label={t('Discovery.Genre')}>
                {genres.map(genre => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
            )}
          </div>
        </TorrentCardDescription>
      </TorrentCard>

      <StyledDialog
        open={isDetailedInfoOpened}
        onClose={closeDetailedInfo}
        fullScreen={fullScreen}
        fullWidth
        maxWidth='xl'
        TransitionComponent={Transition}
        ref={detailedInfoDialogRef}
      >
        <DialogTorrentDetailsContent closeDialog={closeDetailedInfo} torrent={torrent} />
      </StyledDialog>

      <Dialog open={isDeleteTorrentOpened} onClose={closeDeleteTorrentAlert}>
        <DialogTitle>{t('DeleteTorrent?')}</DialogTitle>
        <DialogActions>
          <Button variant='outlined' onClick={closeDeleteTorrentAlert} color='secondary'>
            {t('Cancel')}
          </Button>

          <Button
            variant='contained'
            onClick={() => {
              deleteTorrent(torrent)
              closeDeleteTorrentAlert()
            }}
            color='secondary'
            autoFocus
          >
            {t('OK')}
          </Button>
        </DialogActions>
      </Dialog>

      {isEditDialogOpen && (
        <AddDialog
          hash={hash}
          title={title}
          name={name}
          poster={poster}
          handleClose={handleCloseEditDialog}
          category={category}
        />
      )}
    </>
  )
}

const getTorrServerData = value => {
  try {
    return value ? JSON.parse(value)?.TorrServer || {} : {}
  } catch (error) {
    return {}
  }
}

export const StatusIndicator = ({ stat }) => {
  const { t } = useTranslation()

  const values = {
    [GETTING_INFO]: t('TorrentGettingInfo'),
    [PRELOAD]: t('TorrentPreload'),
    [WORKING]: t('TorrentWorking'),
    [CLOSED]: t('TorrentClosed'),
    [IN_DB]: t('TorrentInDb'),
  }

  const colors = {
    [GETTING_INFO]: '#2196F3',
    [PRELOAD]: '#FFC107',
    [WORKING]: '#CDDC39',
    [CLOSED]: '#E57373',
    [IN_DB]: '#9E9E9E',
  }

  return (
    <span className='description-status-wrapper'>
      <StatusIndicators color={colors[stat]} title={values[stat]} />
    </span>
  )
}

export default memo(Torrent)
