import { useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import axios from 'axios'
import { offlineHost } from 'utils/Hosts'
import { humanizeSize } from 'utils/Utils'

import { downloadFiles, fetchOffline } from './useOffline'
import { mediaTitle } from './media'
import useCinemaText from './text'

const downloadOrder = { downloading: 0, queued: 1, failed: 2 }

export default function Downloads({ torrents, onOpen }) {
  const c = useCinemaText()
  const client = useQueryClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const hashes = torrents.map(item => item.hash).sort()
  const query = useQuery(
    ['cinema-downloads', hashes],
    async ({ signal }) => {
      let index = 0
      const rows = []
      // ponytail: The deployed server has per-torrent status only. Bound requests while including
      // downloads started on other devices; use a list API when that server API is deployed.
      await Promise.all(
        Array.from({ length: Math.min(4, torrents.length) }, async () => {
          while (index < torrents.length && !signal?.aborted) {
            const torrent = torrents[index++]
            try {
              // eslint-disable-next-line no-await-in-loop -- Four sequential workers bound server load.
              rows.push({ torrent, status: await fetchOffline(torrent.hash, signal) })
            } catch (failure) {
              if (signal?.aborted) throw failure
              rows.push({ torrent, failed: true })
            }
          }
        }),
      )
      return rows
    },
    {
      retry: false,
      enabled: !pending,
      refetchInterval: data =>
        data?.some(row => ['queued', 'downloading'].includes(row.status?.state)) ? 5000 : 30000,
    },
  )
  const items = (query.data || []).flatMap(row =>
    downloadFiles(row.torrent, row.status).map(file => ({ ...row, file })),
  )
  const act = async (row, action) => {
    if (pending) return
    setPending(true)
    setError('')
    try {
      await axios.post(
        offlineHost(),
        {
          action: row.file.id ? `${action}_file` : action,
          hash: row.torrent.hash,
          title: row.torrent.title,
          ...(row.file.id ? { file_id: row.file.id } : {}),
        },
        { timeout: 15000 },
      )
      client.invalidateQueries(['cinema-offline', row.torrent.hash])
    } catch (failure) {
      setError(failure.response?.data?.error || failure.message)
    } finally {
      setPending(false)
      client.invalidateQueries('cinema-downloads')
    }
  }
  return (
    <section className='cinema-detail'>
      <h1 className='cinema-title'>{c.downloads}</h1>
      <p className='cinema-note'>{c.downloadHint}</p>
      <p className='cinema-note'>{c.downloadQueueHint}</p>
      {query.isLoading && <p role='status'>{c.loading}</p>}
      {(query.isError || query.data?.some(row => row.failed || !row.status?.available)) && (
        <p className='cinema-error' role='alert'>
          {c.storageError}{' '}
          <button type='button' className='cinema-button' onClick={() => query.refetch()}>
            {c.retry}
          </button>
        </p>
      )}
      {error && (
        <p className='cinema-error' role='alert'>
          {error}
        </p>
      )}
      {!query.isLoading &&
        !items.length &&
        !query.isError &&
        !query.data?.some(row => row.failed || !row.status?.available) && (
          <p className='cinema-note'>{c.noDownloads}</p>
        )}
      <ul className='cinema-episodes'>
        {items
          .sort(
            (a, b) =>
              (downloadOrder[a.file.state] ?? 3) - (downloadOrder[b.file.state] ?? 3) ||
              mediaTitle(a.torrent).localeCompare(mediaTitle(b.torrent)) ||
              a.file.id - b.file.id,
          )
          .map(row => (
            <li key={`${row.torrent.hash}:${row.file.id}`} className='cinema-episode'>
              <button type='button' className='cinema-episode-choice' onClick={() => onOpen(row.torrent.hash)}>
                <strong>{mediaTitle(row.torrent)}</strong>
                <small>
                  {row.file.path?.split(/[\\/]/).pop() ||
                    (row.file.id ? `${c.file} ${row.file.id}` : c.preparingDownload)}
                </small>
                <small>
                  {c[row.file.state] || row.file.state}
                  {row.file.length > 0 &&
                    ` · ${humanizeSize(row.file.downloaded_bytes || 0)} / ${humanizeSize(row.file.length)}`}
                </small>
                {row.file.length > 0 && ['queued', 'downloading'].includes(row.file.state) && (
                  <progress
                    className='cinema-progress'
                    max={row.file.length || 1}
                    value={row.file.downloaded_bytes || 0}
                    aria-label={c.downloading}
                  />
                )}
                {row.file.error && <small>{row.file.error}</small>}
              </button>
              {(['queued', 'downloading'].includes(row.file.state) ||
                (row.file.id > 0 && ['failed', 'cancelled', 'missing'].includes(row.file.state))) && (
                <button
                  type='button'
                  className='cinema-button'
                  disabled={pending || !row.status.available}
                  onClick={() => act(row, ['queued', 'downloading'].includes(row.file.state) ? 'cancel' : 'start')}
                >
                  {['queued', 'downloading'].includes(row.file.state) ? c.cancel : c.retry}
                </button>
              )}
            </li>
          ))}
      </ul>
    </section>
  )
}
