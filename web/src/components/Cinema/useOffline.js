import axios from 'axios'
import { useQuery, useQueryClient } from 'react-query'
import { useState } from 'react'
import { offlineHost, offlineStatusHost } from 'utils/Hosts'

import { mediaFiles } from './media'

// The server accepts selections before its single worker resolves the file manifest.
export const offlineFile = (status, id) => {
  const file = status?.files?.find(item => Number(item.id) === Number(id))
  if (
    (!file || file.state === 'not_downloaded') &&
    (status?.pending_all || status?.pending_file_ids?.some(value => Number(value) === Number(id)))
  )
    return { ...file, id: Number(id), state: 'queued' }
  return file
}

export const downloadFiles = (torrent, status) => {
  const known = new Map(mediaFiles(torrent).map(file => [file.id, file]))
  const ids = new Set([
    ...(status?.files || []).map(file => Number(file.id)),
    ...(status?.pending_file_ids || []).map(Number),
    ...(status?.pending_all ? [...known.keys()] : []),
  ])
  const files = [...ids]
    .map(id => ({ ...known.get(id), ...offlineFile(status, id), id }))
    .filter(file => file.state && file.state !== 'not_downloaded')
  if (
    !files.length &&
    ['queued', 'downloading', 'failed', 'cancelled', 'missing', 'completed', 'partial'].includes(status?.state)
  )
    files.push({
      id: 0,
      state: status.state,
      error: status.error,
      length: status.total_bytes,
      downloaded_bytes: status.downloaded_bytes,
    })
  return files
}

export const fetchOffline = (hash, signal) =>
  axios.get(offlineStatusHost(hash), { signal, timeout: 8000 }).then(result => result.data)

export default function useOffline(torrent) {
  const client = useQueryClient()
  const key = ['cinema-offline', torrent.hash]
  const [pending, setPending] = useState(false)
  const query = useQuery(key, ({ signal }) => fetchOffline(torrent.hash, signal), {
    enabled: !pending,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const [actionError, setActionError] = useState('')
  const action = async (command, fileId) => {
    if (pending) return
    setPending(true)
    setActionError('')
    await client.cancelQueries(key)
    try {
      const { data } = await axios.post(
        offlineHost(),
        {
          action: command,
          hash: torrent.hash,
          title: torrent.title,
          ...(fileId !== undefined ? { file_id: fileId } : {}),
        },
        { timeout: 15000 },
      )
      client.setQueryData(key, data)
    } catch (error) {
      setActionError(error.response?.data?.error || error.message)
    } finally {
      setPending(false)
      client.invalidateQueries(key)
      client.invalidateQueries('cinema-downloads')
    }
  }
  return { ...query, action, pending, actionError }
}
