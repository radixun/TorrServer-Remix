import { offlineStreamHost, streamHost } from 'utils/Hosts'
import { getVlcLink } from 'utils/playerLinks'
import isEqual from 'lodash/isEqual'
import { humanizeSize } from 'utils/Utils'
import ptt from 'parse-torrent-title'
import { Button, useMediaQuery } from '@material-ui/core'
import FileCopyIcon from '@material-ui/icons/FileCopy'
import CancelIcon from '@material-ui/icons/Cancel'
import DeleteForeverIcon from '@material-ui/icons/DeleteForever'
import GetAppIcon from '@material-ui/icons/GetApp'
import CopyToClipboard from 'react-copy-to-clipboard'
import { useTranslation } from 'react-i18next'

import VideoPlayer from '../../VideoPlayer'
import { TableStyle, ShortTableWrapper, ShortTable } from './style'

const { memo, useMemo, useState } = require('react')

// russian episode detection support
ptt.addHandler('episode', /(\d{1,4})[- |. ]серия|серия[- |. ](\d{1,4})/i, {
  type: 'integer',
})
ptt.addHandler('season', /sezon[- |. ](\d{1,3})|(\d{1,3})[- |. ]sezon/i, {
  type: 'integer',
})
ptt.addHandler('season', /сезон[- |. ](\d{1,3})|(\d{1,3})[- |. ]сезон/i, {
  type: 'integer',
})

const LinkButton = ({ href, children, ...props }) => (
  <Button component='a' href={href} style={{ width: '100%' }} {...props}>
    {children}
  </Button>
)

const FileStorageActions = ({
  file,
  offlineFile,
  offlineFullLink,
  isEpisode,
  isSupported,
  onNotSupported,
  onOfflineAction,
  title,
}) => {
  const { t } = useTranslation()
  const state = offlineFile?.state || (offlineFile?.completed ? 'completed' : 'not_downloaded')
  const active = state === 'queued' || state === 'downloading'
  const completed = state === 'completed' && offlineFullLink
  const retry = state === 'failed' || state === 'cancelled' || state === 'missing'
  const progress = file.length > 0 ? Math.round(((offlineFile?.downloaded_bytes || 0) / file.length) * 100) : 0
  const downloadLabel = isEpisode ? t('OfflineStorage.DownloadEpisode') : t('OfflineStorage.DownloadFile')

  return (
    <div className={`offline-file-actions state-${state}`}>
      {completed &&
        (isSupported ? (
          <VideoPlayer
            title={title}
            videoSrc={offlineFullLink.toString()}
            buttonLabel={t('OfflineStorage.Watch')}
            onNotSupported={onNotSupported}
          />
        ) : (
          <LinkButton
            href={offlineFullLink.toString()}
            target='_blank'
            rel='noreferrer'
            variant='outlined'
            color='primary'
            size='small'
            title={t('OfflineStorage.Watch')}
          >
            {t('OfflineStorage.Watch')}
          </LinkButton>
        ))}
      {active && (
        <Button
          variant='outlined'
          color='primary'
          size='small'
          startIcon={<CancelIcon fontSize='small' />}
          onClick={() => onOfflineAction('cancel_file', file.id)}
          title={t('OfflineStorage.CancelFile')}
        >
          {state === 'queued' ? t('OfflineStorage.Queued') : `${t('OfflineStorage.Downloading')} ${progress}%`}
        </Button>
      )}
      {!active && !completed && (
        <Button
          variant='outlined'
          color='secondary'
          size='small'
          startIcon={<GetAppIcon fontSize='small' />}
          onClick={() => onOfflineAction('start_file', file.id)}
          disabled={!onOfflineAction}
        >
          {retry ? t('OfflineStorage.RetryFile') : downloadLabel}
        </Button>
      )}
      {(completed || retry) && (
        <Button
          className='delete-offline-file'
          variant='outlined'
          color='primary'
          size='small'
          aria-label={t('OfflineStorage.DeleteFile')}
          title={t('OfflineStorage.DeleteFile')}
          onClick={() => onOfflineAction('delete_file', file.id)}
        >
          <DeleteForeverIcon fontSize='small' />
        </Button>
      )}
    </div>
  )
}

const Table = memo(
  ({
    playableFileList,
    viewedFileList,
    selectedSeason,
    seasonAmount,
    hash,
    metadataFiles = [],
    defaultDurationMinutes,
    offlineStatus,
    onOfflineAction,
  }) => {
    const { t } = useTranslation()
    const [isSupported, setIsSupported] = useState(true)
    const useCompactTable = useMediaQuery('@media (max-width:930px)')
    const getFileLink = (path, id) =>
      `${streamHost()}/${encodeURIComponent(path.split('\\').pop().split('/').pop())}?link=${hash}&index=${id}&play`
    const metadataById = useMemo(() => {
      const result = {}

      metadataFiles.forEach(file => {
        result[file.id] = file
      })

      return result
    }, [metadataFiles])
    const getFileMeta = file => {
      const parsed = ptt.parse(file.path)
      const metadata = metadataById[file.id] || {}
      return {
        title: parsed.title,
        season: metadata.season || parsed.season,
        episode: metadata.episode || parsed.episode,
        resolution: metadata.resolution || parsed.resolution,
        durationMinutes: getMetadataDurationMinutes(metadata),
      }
    }
    const fileHasEpisodeText = !!playableFileList?.find(file => getFileMeta(file).episode)
    const fileHasSeasonText = !!playableFileList?.find(file => getFileMeta(file).season)
    const fileHasResolutionText = !!playableFileList?.find(file => getFileMeta(file).resolution)
    const offlineFilesByID = useMemo(() => {
      const result = {}
      ;(offlineStatus?.files || []).forEach(file => {
        result[file.id] = file
      })
      return result
    }, [offlineStatus])

    // if files in list is more then 1 and no season text detected by ptt.parse, show full name
    const shouldDisplayFullFileName = playableFileList?.length > 1 && !fileHasEpisodeText

    return !playableFileList?.length ? (
      <div className='empty-file-list'>{t('NoPlayableFiles')}</div>
    ) : (
      <>
        {!useCompactTable && (
          <TableStyle>
            <thead>
              <tr>
                <th style={{ width: '76px' }}>{t('Viewed')}</th>
                <th>{t('Name')}</th>
                {fileHasSeasonText && seasonAmount?.length === 1 && <th style={{ width: '78px' }}>{t('Season')}</th>}
                {fileHasEpisodeText && <th style={{ width: '112px' }}>{t('Episode')}</th>}
                {fileHasResolutionText && <th style={{ width: '112px' }}>{t('Resolution')}</th>}
                <th style={{ width: '184px' }}>{t('Duration')}</th>
                <th style={{ width: '92px' }}>{t('Size')}</th>
                <th
                  style={{
                    width: '260px',
                  }}
                >
                  {t('Actions')}
                </th>
              </tr>
            </thead>

            <tbody>
              {playableFileList.map(file => {
                const { id, path, length } = file
                const { title, resolution, episode, season, durationMinutes } = getFileMeta(file)
                const isViewed = viewedFileList?.includes(id)
                const link = getFileLink(path, id)
                const fullLink = new URL(link, window.location.href)
                const vlcLink = getVlcLink(fullLink)
                const offlineFile = offlineFilesByID[id]
                const offlineLink = offlineFile?.completed ? offlineStreamHost(hash, id, path) : null
                const offlineFullLink = offlineLink ? new URL(offlineLink, window.location.href) : null
                const durationText = formatDurationMinutes(durationMinutes || defaultDurationMinutes, t)
                const displayName = getDisplayName({
                  title,
                  episode,
                  path,
                  shouldDisplayFullFileName,
                  t,
                })

                return (
                  (season === selectedSeason || !seasonAmount?.length) && (
                    <tr key={id} className={isViewed ? 'viewed-file-row' : null}>
                      <td
                        data-label='viewed'
                        aria-label='viewed'
                        className={isViewed ? 'viewed-file-indicator' : null}
                      />
                      <td data-label='name'>
                        <strong>{displayName}</strong>
                        <span>{isViewed ? t('ContinueWatching') : t('FileReady')}</span>
                      </td>
                      {fileHasSeasonText && seasonAmount?.length === 1 && <td data-label='season'>{season}</td>}
                      {fileHasEpisodeText && <td data-label='episode'>{formatEpisodeCode(season, episode)}</td>}
                      {fileHasResolutionText && <td data-label='resolution'>{resolution}</td>}
                      <td data-label='duration'>{durationText}</td>
                      <td data-label='size'>{humanizeSize(length)}</td>
                      <td className='actions-cell'>
                        <div className='file-action-stack'>
                          <div className='button-cell'>
                            {isSupported ? (
                              <VideoPlayer title={title} videoSrc={link} onNotSupported={() => setIsSupported(false)} />
                            ) : (
                              <LinkButton
                                href={link}
                                target='_blank'
                                rel='noreferrer'
                                variant='outlined'
                                color='primary'
                                size='small'
                              >
                                {t('Watch')}
                              </LinkButton>
                            )}
                            <LinkButton href={vlcLink} variant='outlined' color='primary' size='small'>
                              VLC
                            </LinkButton>
                            <CopyToClipboard text={fullLink.toString()}>
                              <Button
                                className='icon-action'
                                variant='outlined'
                                color='primary'
                                size='small'
                                aria-label={t('CopyLink')}
                                title={t('CopyLink')}
                              >
                                <FileCopyIcon fontSize='small' />
                              </Button>
                            </CopyToClipboard>
                          </div>
                          <FileStorageActions
                            file={file}
                            offlineFile={offlineFile}
                            offlineFullLink={offlineFullLink}
                            isEpisode={!!episode || playableFileList.length > 1}
                            isSupported={isSupported}
                            onNotSupported={() => setIsSupported(false)}
                            onOfflineAction={onOfflineAction}
                            title={title}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                )
              })}
            </tbody>
          </TableStyle>
        )}

        {useCompactTable && (
          <ShortTableWrapper>
            {playableFileList.map(file => {
              const { id, path, length } = file
              const { title, resolution, episode, season, durationMinutes } = getFileMeta(file)
              const isViewed = viewedFileList?.includes(id)
              const link = getFileLink(path, id)
              const fullLink = new URL(link, window.location.href)
              const vlcLink = getVlcLink(fullLink)
              const offlineFile = offlineFilesByID[id]
              const offlineLink = offlineFile?.completed ? offlineStreamHost(hash, id, path) : null
              const offlineFullLink = offlineLink ? new URL(offlineLink, window.location.href) : null
              const durationText = formatDurationMinutes(durationMinutes || defaultDurationMinutes, t)
              const displayName = getDisplayName({
                title,
                episode,
                path,
                shouldDisplayFullFileName,
                t,
              })

              return (
                (season === selectedSeason || !seasonAmount?.length) && (
                  <ShortTable key={id} isViewed={isViewed}>
                    <div className='short-table-name'>{displayName}</div>
                    <div className='short-table-data'>
                      {isViewed && (
                        <div className='short-table-field'>
                          <div className='short-table-field-name'>{t('Viewed')}</div>
                          <div className='short-table-field-value'>
                            <div className='short-table-viewed-indicator' />
                          </div>
                        </div>
                      )}
                      {fileHasSeasonText && seasonAmount?.length === 1 && (
                        <div className='short-table-field'>
                          <div className='short-table-field-name'>{t('Season')}</div>
                          <div className='short-table-field-value'>{season}</div>
                        </div>
                      )}
                      {fileHasEpisodeText && (
                        <div className='short-table-field'>
                          <div className='short-table-field-name'>{t('Episode')}</div>
                          <div className='short-table-field-value'>{formatEpisodeCode(season, episode)}</div>
                        </div>
                      )}
                      {fileHasResolutionText && (
                        <div className='short-table-field'>
                          <div className='short-table-field-name'>{t('Resolution')}</div>
                          <div className='short-table-field-value'>{resolution}</div>
                        </div>
                      )}
                      <div className='short-table-field'>
                        <div className='short-table-field-name'>{t('Duration')}</div>
                        <div className='short-table-field-value'>{durationText}</div>
                      </div>
                      <div className='short-table-field'>
                        <div className='short-table-field-name'>{t('Size')}</div>
                        <div className='short-table-field-value'>{humanizeSize(length)}</div>
                      </div>
                    </div>
                    <div className='short-table-buttons'>
                      {isSupported ? (
                        <VideoPlayer title={title} videoSrc={link} onNotSupported={() => setIsSupported(false)} />
                      ) : (
                        <LinkButton
                          href={link}
                          target='_blank'
                          rel='noreferrer'
                          variant='outlined'
                          color='primary'
                          size='small'
                        >
                          {t('Watch')}
                        </LinkButton>
                      )}

                      <LinkButton href={vlcLink} variant='outlined' color='primary' size='small'>
                        VLC
                      </LinkButton>

                      <CopyToClipboard text={fullLink.toString()}>
                        <Button
                          className='icon-action'
                          variant='outlined'
                          color='primary'
                          size='small'
                          aria-label={t('CopyLink')}
                          title={t('CopyLink')}
                        >
                          <FileCopyIcon fontSize='small' />
                        </Button>
                      </CopyToClipboard>
                    </div>
                    <FileStorageActions
                      file={file}
                      offlineFile={offlineFile}
                      offlineFullLink={offlineFullLink}
                      isEpisode={!!episode || playableFileList.length > 1}
                      isSupported={isSupported}
                      onNotSupported={() => setIsSupported(false)}
                      onOfflineAction={onOfflineAction}
                      title={title}
                    />
                  </ShortTable>
                )
              )
            })}
          </ShortTableWrapper>
        )}
      </>
    )
  },
  (prev, next) => isEqual(prev, next),
)

export default Table

const formatEpisodeCode = (season, episode) => {
  if (!episode) return ''
  const seasonCode = String(season || 1).padStart(2, '0')
  const episodeCode = String(episode).padStart(2, '0')
  return `S${seasonCode}E${episodeCode}`
}

const getDisplayName = ({ title, episode, path, shouldDisplayFullFileName, t }) => {
  if (shouldDisplayFullFileName) return path
  if (episode) return `${t('Episode')} ${String(episode).padStart(2, '0')}`
  return title || path
}

const getMetadataDurationMinutes = metadata =>
  normalizeDurationMinutes(
    metadata.durationMinutes ||
      metadata.duration_minutes ||
      metadata.runtime ||
      metadata.duration ||
      secondsToMinutes(metadata.durationSeconds || metadata.duration_seconds),
  )

const normalizeDurationMinutes = value => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue) : null
}

const secondsToMinutes = value => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue / 60) : null
}

const formatDurationMinutes = (value, t) => {
  const minutes = normalizeDurationMinutes(value)
  if (!minutes) return t('DurationUnknown')

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${minutes} ${t('Discovery.Minutes')}`
  if (!remainder) return `${hours} ${t('DurationHourShort')}`
  return `${hours} ${t('DurationHourShort')} ${remainder} ${t('Discovery.Minutes')}`
}
