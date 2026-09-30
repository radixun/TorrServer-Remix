import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import axios from 'axios'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton } from '@material-ui/core'
import ArrowBackIcon from '@material-ui/icons/ArrowBack'
import GetAppIcon from '@material-ui/icons/GetApp'
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline'
import EditOutlinedIcon from '@material-ui/icons/EditOutlined'
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined'
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline'
import CloseIcon from '@material-ui/icons/Close'
import TuneIcon from '@material-ui/icons/Tune'
import { useTranslation } from 'react-i18next'
import { discoveryDetailsHost, discoverySearchHost, torrentsHost } from 'utils/Hosts'
import { humanizeSize } from 'utils/Utils'
import VideoPlayer from 'components/VideoPlayer'
import DialogTorrentDetailsContent from 'components/DialogTorrentDetailsContent'
import AddDialog from 'components/Add/AddDialog'

import {
  captionSource,
  fileLabel,
  mediaFiles,
  mediaTitle,
  playbackSource,
  readLocalProgress,
  torrentData,
} from './media'
import useOffline, { offlineFile } from './useOffline'
import useCinemaText from './text'
import usePoster from './usePoster'

const normalize = value =>
  String(value || '')
    .toLowerCase()
    .replace(/[\s._:'’/()-]/g, '')

async function loadDescription(torrent, language, signal) {
  const metadata = torrentData(torrent).Metadata || {}
  const tmdb = metadata.tmdb || metadata.TMDB || {}
  const mediaType = tmdb.media_type || torrent.category
  if (!['movie', 'tv'].includes(mediaType)) return null
  let id = tmdb.id || tmdb.ID
  if (!id) {
    const { data } = await axios.get(discoverySearchHost(), {
      params: { media_type: mediaType, query: mediaTitle(torrent), language },
      signal,
      timeout: 8000,
    })
    const names = [mediaTitle(torrent), tmdb.title].filter(Boolean).map(normalize)
    const matches = (data?.results || []).filter(
      item => names.includes(normalize(item.title)) || names.includes(normalize(item.originalName)),
    )
    if (matches.length !== 1) return null
    id = matches[0].id
  }
  const { data } = await axios.get(discoveryDetailsHost(), {
    params: { id, media_type: mediaType, language },
    signal,
    timeout: 8000,
  })
  return data
}

export function DownloadAction({ file, status, action, pending, primary = false }) {
  const c = useCinemaText()
  const item = offlineFile(status, file.id)
  const active = ['queued', 'downloading'].includes(item?.state)
  const complete = item?.state === 'completed' && status?.available
  if (complete)
    return (
      <span className='cinema-saved'>
        <CheckCircleOutlineIcon fontSize='small' />
        {c.completed}
      </span>
    )
  return (
    <button
      type='button'
      className='cinema-button'
      disabled={pending || !status?.available}
      onClick={() => action(active ? 'cancel_file' : 'start_file', file.id)}
      aria-label={`${active ? c.cancel : c.download}: ${fileLabel(file, c.episode)}`}
    >
      {!active && <GetAppIcon fontSize='small' />}
      {pending
        ? c.updating
        : active
        ? `${c[item.state]} · ${c.cancel}${
            item.state === 'downloading'
              ? ` · ${Math.round((100 * item.downloaded_bytes) / Math.max(1, item.length))}%`
              : ''
          }`
        : primary
        ? c.download
        : c[item?.state] === c.failed
        ? c.retry
        : c.download}
    </button>
  )
}

export default function TitlePage({ group, initialHash, onBack }) {
  const c = useCinemaText()
  const { i18n } = useTranslation()
  const client = useQueryClient()
  const [version, setVersion] = useState(initialHash)
  const [fetched, setFetched] = useState(null)
  const base = group.versions.find(item => item.hash === version) || group.torrent
  const torrent = useMemo(() => (fetched?.hash === base.hash ? { ...base, ...fetched } : base), [base, fetched])
  const offline = useOffline(torrent)
  const [selectedId, setSelectedId] = useState(null)
  const [season, setSeason] = useState(null)
  const [advanced, setAdvanced] = useState(false)
  const [details, setDetails] = useState(false)
  const [failedBackdrop, setFailedBackdrop] = useState('')
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const initialized = useRef(null)
  const page = useRef(null)
  const poster = usePoster(torrent)
  const files = useMemo(() => {
    const saved = mediaFiles(torrent)
    return saved.length ? saved : mediaFiles({ ...torrent, file_stats: offline.data?.files })
  }, [torrent, offline.data?.files])
  const [refresh, setRefresh] = useState(0)
  const info = useQuery(
    ['cinema-description', torrent.hash, i18n.language],
    ({ signal }) => loadDescription(torrent, i18n.language, signal),
    { staleTime: 3600000, retry: false },
  )
  const visibleFiles = season ? files.filter(item => item.season === season) : files
  const file = visibleFiles.find(item => item.id === selectedId) || visibleFiles[0]
  const source = file ? playbackSource(torrent, file, offline.data) : null
  const progress = source ? readLocalProgress(source.id) : null
  const seasons = [...new Set(files.map(item => item.season).filter(Boolean))]
  const title = mediaTitle(torrent)
  const scenic = /^https?:\/\//i.test(info.data?.backdrop || '') && info.data.backdrop !== failedBackdrop
  const artwork = scenic ? info.data.backdrop : poster.src
  const filename = file?.path.split(/[\\/]/).pop()
  const allDownloading = ['queued', 'downloading'].includes(offline.data?.state)
  const fileInfo = useQuery(
    ['cinema-files', torrent.hash],
    async ({ signal }) => {
      const { data } = await axios.post(
        torrentsHost(),
        { action: 'get', hash: torrent.hash },
        { signal, timeout: 4000 },
      )
      // An idle torrent first returns metadata without files while it contacts peers.
      if (!mediaFiles(data).length) throw new Error('Torrent files are still being prepared')
      return data
    },
    {
      enabled: !files.length,
      retry: (count, failure) => count < 9 && (!failure.response || failure.response.status >= 500),
      retryDelay: 2000,
      refetchOnWindowFocus: false,
      onSuccess: setFetched,
    },
  )

  useEffect(() => {
    if (!files.length || initialized.current === torrent.hash) return
    initialized.current = torrent.hash
    const recent = files
      .map(item => ({ file: item, progress: readLocalProgress(`${torrent.hash}:${item.id}`) }))
      .filter(item => item.progress?.position > 5)
      .sort((a, b) => b.progress.updatedAt - a.progress.updatedAt)[0]
    setSelectedId(recent?.file.id || null)
    setSeason(recent?.file.season || null)
    if (window.AndroidTorrServer) requestAnimationFrame(() => page.current?.querySelector('.primary')?.focus())
  }, [torrent.hash, files])

  useEffect(() => {
    const update = () => setRefresh(value => value + 1)
    window.addEventListener('cinema:progress', update)
    return () => window.removeEventListener('cinema:progress', update)
  }, [])

  const command = async action => {
    setBusy(true)
    setError('')
    try {
      const { data } = await axios.post(torrentsHost(), { action, hash: torrent.hash }, { timeout: 15000 })
      if (action === 'get') setFetched(data)
      else {
        setRemoving(false)
        client.invalidateQueries('torrents')
        onBack()
      }
    } catch (failure) {
      setError(failure.response?.data?.error || failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className='cinema-detail cinema-title-page' ref={page} data-playback-refresh={refresh}>
      {artwork && (
        <div className={`cinema-title-art${scenic ? '' : ' is-poster'}`} aria-hidden='true'>
          <img src={artwork} alt='' onError={() => (scenic ? setFailedBackdrop(artwork) : poster.onError())} />
        </div>
      )}
      <div className='cinema-title-toolbar'>
        <button type='button' className='cinema-button cinema-back' data-cinema-back onClick={onBack}>
          <ArrowBackIcon />
          {c.back}
        </button>
        <div className='cinema-title-tools'>
          <button type='button' className='cinema-button' aria-haspopup='dialog' onClick={() => setDetails(true)}>
            <InfoOutlinedIcon />
            {c.details}
          </button>
          <button
            type='button'
            className='cinema-button cinema-remove-button'
            aria-label={c.remove}
            aria-haspopup='dialog'
            title={c.remove}
            onClick={() => setRemoving(true)}
          >
            <DeleteOutlineIcon />
          </button>
        </div>
      </div>
      <div className='cinema-hero'>
        <button type='button' className='cinema-cover-edit' onClick={() => setEditing(true)} aria-label={c.editPoster}>
          {poster.src ? <img src={poster.src} alt='' onError={poster.onError} /> : <span>{title}</span>}
          <span className='cinema-cover-edit-label'>
            <EditOutlinedIcon fontSize='small' />
            {c.editPoster}
          </span>
        </button>
        <div>
          <h1 className='cinema-title'>{title}</h1>
          <p className='cinema-facts'>
            {[info.data?.releaseDate?.slice(0, 4), ...(info.data?.genres || []).map(genre => genre.name)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className='cinema-overview'>{info.data?.overview || c.noOverview}</p>
          {group.versions.length > 1 && (
            <div className='cinema-filter' aria-label={c.version}>
              {group.versions.map(item => (
                <button
                  type='button'
                  key={item.hash}
                  className='cinema-button'
                  aria-pressed={item.hash === torrent.hash}
                  onClick={() => setVersion(item.hash)}
                >
                  {item.title} · {torrentData(item).Metadata?.resolution || humanizeSize(item.torrent_size)}
                </button>
              ))}
            </div>
          )}
          {file ? (
            <>
              {files.length > 1 && (
                <p className='cinema-note'>
                  {file.season ? `${c.season} ${file.season} · ` : ''}
                  {fileLabel(file, c.episode)}
                </p>
              )}
              <div className='cinema-actions'>
                <VideoPlayer
                  key={`${torrent.hash}:${file.id}`}
                  title={`${title}${files.length > 1 ? ` · ${fileLabel(file, c.episode)}` : ''}`}
                  videoSrc={source.url}
                  captionSrc={captionSource(torrent, file, offline.data)}
                  mediaId={source.id}
                  buttonClassName='cinema-button primary'
                  buttonLabel={progress?.position > 5 ? c.resume : c.watch}
                  onClosed={() => setRefresh(value => value + 1)}
                />
                <DownloadAction
                  file={file}
                  status={offline.data}
                  action={offline.action}
                  pending={offline.pending}
                  primary
                />
              </div>
              <p className='cinema-note'>
                {source.fromDisk ? c.disk : c.streaming} · {file.resolution ? `${file.resolution} · ` : ''}
                {humanizeSize(file.length)}
              </p>
            </>
          ) : (
            <div role='status'>
              <p>{fileInfo.isError ? c.noFiles : c.loadingFiles}</p>
              {fileInfo.isError && (
                <button type='button' className='cinema-button' onClick={() => fileInfo.refetch()}>
                  {c.retry}
                </button>
              )}
            </div>
          )}
          <p className='cinema-note'>{c.downloadHint}</p>
          {offline.data?.state === 'queued' && (
            <p className='cinema-note' role='status'>
              {c.queueHint}
            </p>
          )}
          {error && (
            <p className='cinema-error' role='alert'>
              {error}
            </p>
          )}
          {offline.isError && (
            <p className='cinema-error' role='status'>
              {c.storageError}
            </p>
          )}
          {offline.actionError && (
            <p className='cinema-error' role='alert'>
              {offline.actionError}
            </p>
          )}
          {offline.data && !offline.data.available && <p className='cinema-note'>{c.unavailable}</p>}
        </div>
      </div>
      {files.length > 1 && (
        <section className='cinema-section'>
          <div className='cinema-section-heading'>
            <div>
              <h2>{torrent.category === 'tv' ? c.episodes : c.version}</h2>
              <span className='cinema-note'>
                {c.filesInTorrent}: {files.length}
              </span>
            </div>
            <button
              type='button'
              className='cinema-button cinema-download-all'
              disabled={!offline.data?.available || offline.pending || offline.data?.state === 'completed'}
              onClick={() => offline.action(allDownloading ? 'cancel' : 'start')}
            >
              <GetAppIcon fontSize='small' />
              {offline.pending ? c.updating : allDownloading ? c.cancel : c.downloadAll}
            </button>
          </div>
          {seasons.length > 1 && (
            <div className='cinema-filter'>
              {[null, ...seasons].map(value => (
                <button
                  key={value || 'all'}
                  type='button'
                  className='cinema-button'
                  aria-pressed={season === value}
                  onClick={() => {
                    setSeason(value)
                    setSelectedId(null)
                  }}
                >
                  {value ? `${c.season} ${value}` : c.all}
                </button>
              ))}
            </div>
          )}
          <ul className='cinema-episodes'>
            {visibleFiles.map(item => {
              const playback = playbackSource(torrent, item, offline.data)
              return (
                <li key={item.id} className='cinema-episode'>
                  <button
                    type='button'
                    className={`cinema-episode-choice${item.id === file?.id ? ' is-current' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={item.id === file?.id}
                  >
                    <strong>{fileLabel(item, c.episode)}</strong>
                    <small>
                      {item.season ? `${c.season} ${item.season} · ` : ''}
                      {item.resolution ? `${item.resolution} · ` : ''}
                      {humanizeSize(item.length)}
                      {playback.fromDisk ? ` · ${c.completed}` : ''}
                    </small>
                  </button>
                  <VideoPlayer
                    title={`${title} · ${fileLabel(item, c.episode)}`}
                    videoSrc={playback.url}
                    captionSrc={captionSource(torrent, item, offline.data)}
                    mediaId={playback.id}
                    buttonClassName='cinema-button'
                    onClosed={() => setRefresh(value => value + 1)}
                  />
                  <DownloadAction file={item} status={offline.data} action={offline.action} pending={offline.pending} />
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <Dialog
        open={details}
        onClose={() => setDetails(false)}
        className='cinema-dialog cinema-file-dialog'
        maxWidth='sm'
        fullWidth
        aria-labelledby='cinema-file-title'
      >
        <DialogTitle>
          <span id='cinema-file-title'>{c.details}</span>
          <IconButton autoFocus aria-label={c.close} onClick={() => setDetails(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <p className='cinema-file-title'>{title}</p>
          {file && (
            <p className='cinema-file-selection'>
              {file.season ? `${c.season} ${file.season} · ` : ''}
              {files.length > 1 ? fileLabel(file, c.episode) : source.fromDisk ? c.disk : c.streaming}
            </p>
          )}
          <dl className='cinema-file-facts'>
            <div>
              <dt>{c.format}</dt>
              <dd>{filename?.split('.').pop().toUpperCase() || '—'}</dd>
            </div>
            <div>
              <dt>{c.quality}</dt>
              <dd>{file?.resolution || '—'}</dd>
            </div>
            <div>
              <dt>{c.fileSize}</dt>
              <dd>{file?.length ? humanizeSize(file.length) : '—'}</dd>
            </div>
            <div>
              <dt>{c.source}</dt>
              <dd>{source ? (source.fromDisk ? c.disk : c.streaming) : '—'}</dd>
            </div>
          </dl>
          <div className='cinema-file-name'>
            <span>{c.file}</span>
            <p>{filename || c.loadingFiles}</p>
          </div>
          <div className='cinema-file-name'>
            <span>{c.version}</span>
            <p>{torrent.name || torrent.title}</p>
          </div>
          {file?.path && file.path !== filename && (
            <details className='cinema-file-path'>
              <summary>{c.fullPath}</summary>
              <p>{file.path}</p>
            </details>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<EditOutlinedIcon />}
            onClick={() => {
              setDetails(false)
              setEditing(true)
            }}
          >
            {c.edit}
          </Button>
          <Button
            startIcon={<TuneIcon />}
            onClick={() => {
              setDetails(false)
              setAdvanced(true)
            }}
          >
            {c.advanced}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={advanced} onClose={() => setAdvanced(false)} fullScreen>
        {advanced && <DialogTorrentDetailsContent closeDialog={() => setAdvanced(false)} torrent={torrent} />}
      </Dialog>
      {editing && (
        <AddDialog
          hash={torrent.hash}
          title={torrent.title}
          name={torrent.name}
          poster={poster.src || ''}
          category={torrent.category}
          handleClose={() => {
            setEditing(false)
            setFetched(null)
            client.invalidateQueries('torrents')
          }}
        />
      )}
      <Dialog
        open={removing}
        onClose={() => !busy && setRemoving(false)}
        className='cinema-dialog'
        aria-labelledby='cinema-remove-title'
      >
        <DialogTitle id='cinema-remove-title'>{c.removeQuestion}</DialogTitle>
        <DialogContent>
          <p>{title}</p>
          {group.versions.length > 1 && <p className='cinema-note'>{torrent.title}</p>}
          {error && <p role='alert'>{error}</p>}
        </DialogContent>
        <DialogActions>
          <Button autoFocus disabled={busy} onClick={() => setRemoving(false)}>
            {c.close}
          </Button>
          <Button disabled={busy} onClick={() => command('rem')}>
            {c.remove}
          </Button>
        </DialogActions>
      </Dialog>
    </article>
  )
}
