import { NoImageIcon } from 'icons'
import { getPeerString, humanizeSize, removeRedundantCharacters } from 'utils/Utils'
import { useEffect, useState } from 'react'
import { Button, ButtonGroup, LinearProgress } from '@material-ui/core'
import CancelIcon from '@material-ui/icons/Cancel'
import CheckCircleIcon from '@material-ui/icons/CheckCircle'
import DeleteSweepIcon from '@material-ui/icons/DeleteSweep'
import DeleteForeverIcon from '@material-ui/icons/DeleteForever'
import GetAppIcon from '@material-ui/icons/GetApp'
import RefreshIcon from '@material-ui/icons/Refresh'
import ptt from 'parse-torrent-title'
import axios from 'axios'
import { discoveryDetailsHost, discoverySearchHost, offlineHost, torrentsHost, viewedHost } from 'utils/Hosts'
import { GETTING_INFO, IN_DB } from 'torrentStates'
import CircularProgress from '@material-ui/core/CircularProgress'
import { useTranslation } from 'react-i18next'
import { TORRENT_CATEGORIES } from 'components/categories'

import { useOfflineStatus, useUpdateCache } from './customHooks'
import DialogHeader from './DialogHeader'
import Table from './Table'
import {
  ContentHeader,
  DataActions,
  DataFact,
  DataFacts,
  DataPanel,
  DialogContentGrid,
  DetailScroll,
  HeroContent,
  HeroTag,
  HeroTags,
  HeroTitle,
  HeroTitleRow,
  MainSection,
  OfflineProgress,
  OverviewCard,
  Poster,
  SectionHeading,
  SectionTitle,
  SectionSubName,
  TorrentFilesSection,
} from './style'
import { isFilePlayable } from './helpers'

const Loader = () => (
  <div style={{ minHeight: '35vh', display: 'grid', placeItems: 'center' }}>
    <CircularProgress color='secondary' />
  </div>
)

const DETAILS_TIMEOUT_MS = 8000

export default function DialogTorrentDetailsContent({ closeDialog, torrent }) {
  const { t, i18n } = useTranslation()
  const [viewedFileList, setViewedFileList] = useState()
  const [playableFileList, setPlayableFileList] = useState()
  const [seasonAmount, setSeasonAmount] = useState(null)
  const [selectedSeason, setSelectedSeason] = useState()
  const [overview, setOverview] = useState('')
  const [genres, setGenres] = useState([])
  const [runtimeMinutes, setRuntimeMinutes] = useState(null)
  const [detailsTimedOut, setDetailsTimedOut] = useState(false)
  const [posterFailed, setPosterFailed] = useState(false)

  const {
    poster,
    hash,
    title,
    category,
    name,
    stat,
    torrent_size: torrentSize,
    duration_seconds: torrentDurationSeconds,
    file_stats: torrentFileList,
    data,
  } = torrent

  const { error: cacheError, retry: retryCache, status: cacheStatus } = useUpdateCache(hash)
  const [offlineStatus, setOfflineStatus] = useOfflineStatus(hash)
  const torrentPending = stat === GETTING_INFO || stat === IN_DB
  const hasRenderableDetails = Boolean(title || name || data || torrentFileList?.length)
  const showInitialLoader = !hasRenderableDetails && torrentPending && !detailsTimedOut

  useEffect(() => {
    if (playableFileList && seasonAmount === null) {
      const seasons = []
      playableFileList.forEach(({ path }) => {
        const currentSeason = ptt.parse(path).season
        if (currentSeason) {
          !seasons.includes(currentSeason) && seasons.push(currentSeason)
        }
      })
      seasons.length && setSelectedSeason(seasons[0])
      setSeasonAmount(seasons.sort((a, b) => a - b))
    }
  }, [playableFileList, seasonAmount])

  useEffect(() => {
    setPlayableFileList(torrentFileList?.filter(({ path }) => isFilePlayable(path)))
  }, [torrentFileList])

  useEffect(() => {
    setPosterFailed(false)
  }, [poster])

  useEffect(() => {
    setDetailsTimedOut(false)
    if (!torrentPending) return undefined

    const timerID = setTimeout(() => setDetailsTimedOut(true), DETAILS_TIMEOUT_MS)
    return () => clearTimeout(timerID)
  }, [hash, torrentPending])

  useEffect(() => {
    let mounted = true

    // getting viewed file list
    axios
      .post(viewedHost(), { action: 'list', hash })
      .then(({ data }) => {
        if (!mounted) return
        if (data) {
          const lst = data.map(itm => itm.file_index).sort((a, b) => a - b)
          setViewedFileList(lst)
        } else setViewedFileList()
      })
      .catch(() => mounted && setViewedFileList())

    return () => {
      mounted = false
    }
  }, [hash])

  const torrentData = getTorrentData(data)
  const metadata = torrentData?.Metadata || {}
  const tmdbMetadata = metadata?.tmdb || metadata?.TMDB || {}

  const getParsedTitle = () => {
    const newNameStringArr = []

    const torrentParsedName = name && ptt.parse(name)

    if (title !== name) {
      newNameStringArr.push(removeRedundantCharacters(title))
    } else if (torrentParsedName?.title) newNameStringArr.push(removeRedundantCharacters(torrentParsedName?.title))

    // These 2 checks are needed to get year and resolution from torrent name if title does not have this info
    const primaryTitle = newNameStringArr[0] || ''

    if (torrentParsedName?.year && !primaryTitle.includes(torrentParsedName?.year))
      newNameStringArr.push(torrentParsedName?.year)
    if (torrentParsedName?.resolution && !primaryTitle.includes(torrentParsedName?.resolution))
      newNameStringArr.push(torrentParsedName?.resolution)

    const newNameString = newNameStringArr.join('. ')

    // removeRedundantCharacters is returning ".." if it was "..."
    const lastDotShouldBeAdded =
      newNameString[newNameString.length - 1] === '.' && newNameString[newNameString.length - 2] === '.'

    return lastDotShouldBeAdded ? `${newNameString}.` : newNameString
  }

  const displayTitle = stripSeasonSuffix(title || metadata.title || getParsedTitle() || name || '')
  const displaySubtitle =
    tmdbMetadata.title && normalizeTitle(tmdbMetadata.title) !== normalizeTitle(displayTitle) ? tmdbMetadata.title : ''
  const categoryLabel = getCategoryLabel(category || metadata.category, t)
  const overviewQuery = stripSeasonSuffix(title || metadata.title || name || '')
  const peerLabel = t('Peers').split('·')[0]
  const metadataFiles = metadata.files || metadata.Files || []
  const defaultDurationMinutes =
    runtimeMinutes || (playableFileList?.length === 1 ? secondsToMinutes(torrentDurationSeconds) : null)
  const dropTorrent = () => axios.post(torrentsHost(), { action: 'drop', hash })
  const removeTorrentViews = () =>
    axios.post(viewedHost(), { action: 'rem', hash, file_index: -1 }).then(() => setViewedFileList())
  const offlineAction = (action, fileID) =>
    axios
      .post(offlineHost(), {
        action,
        hash,
        title: displayTitle || title || name,
        ...(fileID ? { file_id: fileID } : {}),
      })
      .then(({ data: response }) => setOfflineStatus(response))
      .catch(error =>
        setOfflineStatus(current => ({
          ...current,
          error: error?.response?.data?.error || error.message,
        })),
      )
  const offlineStateLabel = getOfflineStateLabel(offlineStatus, t)
  const isOfflineActive = offlineStatus.state === 'queued' || offlineStatus.state === 'downloading'
  const isOfflineComplete = offlineStatus.state === 'completed'
  const hasOfflineFiles = (offlineStatus.files || []).some(file => file.state !== 'not_downloaded')

  useEffect(() => {
    let isMounted = true
    const mediaType = category === 'tv' || metadata?.category === 'tv' ? 'tv' : 'movie'
    const query = stripSeasonSuffix(overviewQuery)

    if (
      !query ||
      (category !== 'movie' && category !== 'tv' && metadata?.category !== 'movie' && metadata?.category !== 'tv')
    ) {
      setOverview('')
      setGenres([])
      setRuntimeMinutes(null)
      return () => {
        isMounted = false
      }
    }

    setGenres([])
    setRuntimeMinutes(null)
    axios
      .get(discoverySearchHost(), {
        params: {
          media_type: mediaType,
          query,
          language: i18n.language,
        },
      })
      .then(({ data: response }) => {
        if (!isMounted) return
        const firstResult = response?.results?.[0]
        setOverview(firstResult?.overview || '')

        if (!firstResult?.id) return

        axios
          .get(discoveryDetailsHost(), {
            params: {
              id: firstResult.id,
              media_type: firstResult.mediaType || mediaType,
              language: i18n.language,
            },
          })
          .then(({ data: details }) => {
            if (isMounted) {
              setRuntimeMinutes(normalizeMinutes(details?.runtime))
              setGenres(normalizeGenres(details?.genres))
            }
          })
          .catch(() => {
            if (isMounted) {
              setRuntimeMinutes(null)
              setGenres([])
            }
          })
      })
      .catch(() => {
        if (isMounted) {
          setOverview('')
          setGenres([])
          setRuntimeMinutes(null)
        }
      })

    return () => {
      isMounted = false
    }
  }, [category, i18n.language, metadata?.category, overviewQuery])

  return (
    <>
      <DialogHeader onClose={closeDialog} title={t('TorrentDetails')} />

      <DetailScroll>
        {showInitialLoader && <Loader />}
        {!showInitialLoader && (
          <>
            {torrentPending && !detailsTimedOut && (
              <div role='status' style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px 0' }}>
                <CircularProgress color='secondary' size={18} />
                <span>{t('TorrentGettingInfo')}</span>
              </div>
            )}
            {(detailsTimedOut || cacheStatus === 'error') && (
              <div
                role='alert'
                style={{
                  alignItems: 'center',
                  background: 'rgba(211, 47, 47, 0.08)',
                  border: '1px solid rgba(211, 47, 47, 0.35)',
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'space-between',
                  margin: '16px 24px 0',
                  padding: '10px 12px',
                }}
              >
                <span>{cacheError || `${t('SettingsDialog.SaveError')}${t('TorrentGettingInfo')}`}</span>
                {cacheStatus === 'error' && (
                  <Button color='secondary' onClick={retryCache} size='small' variant='outlined'>
                    {t('Update')}
                  </Button>
                )}
              </div>
            )}
            <DialogContentGrid>
              <MainSection>
                <Poster poster={poster && !posterFailed}>
                  {poster && !posterFailed ? (
                    <img alt='poster' src={poster} onError={() => setPosterFailed(true)} />
                  ) : (
                    <NoImageIcon />
                  )}
                </Poster>

                <HeroContent>
                  <HeroTitleRow>
                    <HeroTitle>{displayTitle || getParsedTitle()}</HeroTitle>
                    {genres.length > 0 && (
                      <HeroTags aria-label={t('Discovery.Genre')}>
                        {genres.map(genre => (
                          <HeroTag key={genre}>{genre}</HeroTag>
                        ))}
                      </HeroTags>
                    )}
                    {displaySubtitle && <SectionSubName className='hero-subtitle'>{displaySubtitle}</SectionSubName>}
                  </HeroTitleRow>

                  <OverviewCard>
                    <h3>{t('TorrentOverview')}</h3>
                    <p>{overview || t('Discovery.NoOverview')}</p>
                  </OverviewCard>
                </HeroContent>

                <DataPanel>
                  <h3>{t('TorrentData')}</h3>
                  <DataFacts>
                    <DataFact>
                      <span>{t('TorrentSize')}</span>
                      <strong>{torrentSize > 0 ? humanizeSize(torrentSize) : t('None')}</strong>
                    </DataFact>
                    <DataFact>
                      <span>{peerLabel}</span>
                      <strong>{formatPeers(torrent)}</strong>
                    </DataFact>
                    <DataFact>
                      <span>{t('Category')}</span>
                      <strong>{categoryLabel}</strong>
                    </DataFact>
                    <DataFact>
                      <span>{t('OfflineStorage.Title')}</span>
                      <strong>{offlineStateLabel}</strong>
                    </DataFact>
                  </DataFacts>
                  {isOfflineActive && (
                    <OfflineProgress>
                      <LinearProgress variant='determinate' value={Math.min(100, offlineStatus.progress || 0)} />
                      <span>{formatOfflineProgress(offlineStatus, t)}</span>
                    </OfflineProgress>
                  )}
                  {offlineStatus.error && offlineStatus.state !== 'unavailable' && (
                    <OfflineProgress className='offline-error'>{offlineStatus.error}</OfflineProgress>
                  )}
                  <DataActions>
                    {!isOfflineActive && !isOfflineComplete && (
                      <Button
                        className='offline-action'
                        onClick={() => offlineAction('start')}
                        variant='contained'
                        color='secondary'
                        startIcon={<GetAppIcon fontSize='small' />}
                        disabled={!offlineStatus.available}
                      >
                        {offlineStatus.state === 'failed' || offlineStatus.state === 'cancelled'
                          ? t('OfflineStorage.Retry')
                          : t('OfflineStorage.DownloadAll')}
                      </Button>
                    )}
                    {isOfflineActive && (
                      <Button
                        className='offline-action'
                        onClick={() => offlineAction('cancel')}
                        variant='outlined'
                        color='primary'
                        startIcon={<CancelIcon fontSize='small' />}
                      >
                        {t('OfflineStorage.Cancel')}
                      </Button>
                    )}
                    {isOfflineComplete && (
                      <Button
                        className='offline-action'
                        variant='outlined'
                        color='primary'
                        startIcon={<CheckCircleIcon fontSize='small' />}
                        disabled
                      >
                        {t('OfflineStorage.Downloaded')}
                      </Button>
                    )}
                    {(isOfflineComplete || hasOfflineFiles) && !isOfflineActive && (
                      <Button
                        className='offline-action'
                        onClick={() => offlineAction('delete')}
                        variant='outlined'
                        color='primary'
                        startIcon={<DeleteForeverIcon fontSize='small' />}
                      >
                        {t('OfflineStorage.Delete')}
                      </Button>
                    )}
                    <Button
                      onClick={removeTorrentViews}
                      variant='outlined'
                      color='primary'
                      startIcon={<DeleteSweepIcon fontSize='small' />}
                    >
                      {t('RemoveViews')}
                    </Button>
                    <Button
                      onClick={dropTorrent}
                      variant='outlined'
                      color='primary'
                      startIcon={<RefreshIcon fontSize='small' />}
                    >
                      {t('DropTorrent')}
                    </Button>
                  </DataActions>
                </DataPanel>
              </MainSection>

              <TorrentFilesSection>
                <ContentHeader>
                  <SectionHeading>{t('TorrentContent')}</SectionHeading>
                  <SectionSubName>{t('TorrentContentHint')}</SectionSubName>
                </ContentHeader>

                {seasonAmount?.length > 1 && (
                  <>
                    <SectionSubName mb={7}>{t('SelectSeason')}</SectionSubName>
                    <ButtonGroup style={{ marginBottom: '30px' }} color='secondary'>
                      {seasonAmount.map(season => (
                        <Button
                          key={season}
                          variant={selectedSeason === season ? 'contained' : 'outlined'}
                          onClick={() => setSelectedSeason(season)}
                        >
                          {season}
                        </Button>
                      ))}
                    </ButtonGroup>

                    <SectionTitle mb={20}>
                      {t('Season')} {selectedSeason}
                    </SectionTitle>
                  </>
                )}

                <Table
                  hash={hash}
                  playableFileList={playableFileList}
                  viewedFileList={viewedFileList}
                  selectedSeason={selectedSeason}
                  seasonAmount={seasonAmount}
                  metadataFiles={metadataFiles}
                  defaultDurationMinutes={defaultDurationMinutes}
                  offlineStatus={offlineStatus}
                  onOfflineAction={offlineAction}
                />
              </TorrentFilesSection>
            </DialogContentGrid>
          </>
        )}
      </DetailScroll>
    </>
  )
}

const getTorrentData = value => {
  try {
    return value ? JSON.parse(value)?.TorrServer : null
  } catch (error) {
    return null
  }
}

const stripSeasonSuffix = value => removeRedundantCharacters(value || '').replace(/\s*\/\s*S\d{1,3}\s*$/i, '')

const normalizeTitle = value => stripSeasonSuffix(value).toLowerCase()

const formatPeers = torrent => (getPeerString(torrent) || '0 / 0').split('·')[0].trim()

const normalizeMinutes = value => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue) : null
}

const normalizeGenres = value =>
  Array.isArray(value)
    ? value
        .map(genre => (typeof genre === 'string' ? genre : genre?.name))
        .filter(Boolean)
        .slice(0, 4)
    : []

const secondsToMinutes = value => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue / 60) : null
}

const getCategoryLabel = (category, t) => {
  if (!category) return t('None')
  const knownCategory = TORRENT_CATEGORIES.find(item => item.key === category)
  return knownCategory ? t(knownCategory.name) : category
}

const getOfflineStateLabel = (status, t) => {
  const labels = {
    unavailable: t('OfflineStorage.Unavailable'),
    not_downloaded: t('OfflineStorage.NotDownloaded'),
    queued: t('OfflineStorage.Queued'),
    downloading: t('OfflineStorage.Downloading'),
    partial: t('OfflineStorage.Partial'),
    completed: t('OfflineStorage.Downloaded'),
    cancelled: t('OfflineStorage.Cancelled'),
    failed: t('OfflineStorage.Failed'),
    missing: t('OfflineStorage.Missing'),
  }
  return labels[status?.state] || t('OfflineStorage.NotDownloaded')
}

const formatOfflineProgress = (status, t) => {
  const progress = Math.round(status?.progress || 0)
  const speed = status?.download_speed > 0 ? ` · ${humanizeSize(status.download_speed)}/${t('Sec')}` : ''
  return `${progress}%${speed}${status?.current_file ? ` · ${status.current_file}` : ''}`
}
