import ptt from 'parse-torrent-title'
import { offlineStreamHost, streamHost } from 'utils/Hosts'
import { isFilePlayable } from 'components/DialogTorrentDetailsContent/helpers'

export const torrentData = torrent => {
  try {
    const value = typeof torrent?.data === 'string' ? JSON.parse(torrent.data) : torrent?.data
    return value?.TorrServer || {}
  } catch (_) {
    return {}
  }
}

export const mediaTitle = torrent =>
  String(torrentData(torrent).Metadata?.title || torrent?.title || torrent?.name || '—').replace(/\s*\/\s*S\d+$/i, '')

export const mediaFiles = torrent => {
  const data = torrentData(torrent)
  const metadata = data.Metadata?.files || []
  const files = torrent?.file_stats?.length ? torrent.file_stats : data.Files
  if (!Array.isArray(files)) return []
  return files
    .filter(file => file && Number(file.id) > 0 && typeof file.path === 'string' && isFilePlayable(file.path))
    .map(file => {
      const parsed = ptt.parse(file.path)
      const known = metadata.find(item => Number(item.id) === Number(file.id)) || {}
      return {
        ...file,
        id: Number(file.id),
        season: known.season || parsed.season || data.Metadata?.season,
        episode: known.episode || parsed.episode,
        resolution: known.resolution || parsed.resolution || data.Metadata?.resolution,
      }
    })
    .sort(
      (a, b) =>
        (a.season || 0) - (b.season || 0) ||
        (a.episode || 0) - (b.episode || 0) ||
        a.path.localeCompare(b.path, undefined, { numeric: true }),
    )
}

export const playbackSource = (torrent, file, status) => {
  const saved = status?.files?.find(item => Number(item.id) === Number(file.id))
  const fromDisk = status?.available === true && saved?.state === 'completed' && saved?.completed === true
  return {
    fromDisk,
    url: fromDisk
      ? offlineStreamHost(torrent.hash, file.id, file.path)
      : `${streamHost()}/${encodeURIComponent(file.path.split(/[\\/]/).pop())}?link=${encodeURIComponent(
          torrent.hash,
        )}&index=${file.id}&play`,
    id: `${torrent.hash}:${file.id}`,
  }
}

export const captionSource = (torrent, file, status) => {
  const base = file.path.replace(/\.[^/.]+$/, '')
  const files = torrent?.file_stats?.length ? torrent.file_stats : torrentData(torrent).Files
  const caption = (Array.isArray(files) ? files : []).find(
    item =>
      Number(item.id) > 0 &&
      typeof item.path === 'string' &&
      item.path.startsWith(`${base}.`) &&
      /\.(vtt|srt)$/i.test(item.path),
  )
  return caption ? playbackSource(torrent, caption, status).url : ''
}

export const groupLibrary = torrents => {
  const groups = new Map()
  ;(Array.isArray(torrents) ? torrents : []).forEach(torrent => {
    const metadata = torrentData(torrent).Metadata || {}
    const tmdb = metadata.tmdb || metadata.TMDB || {}
    const id = Number(tmdb.id || tmdb.ID)
    // Only a server-supplied identity permits merging; similar names are not proof.
    const key = id > 0 && ['movie', 'tv'].includes(tmdb.media_type) ? `${tmdb.media_type}:${id}` : torrent.hash
    if (!groups.has(key)) groups.set(key, { key, torrent, versions: [] })
    groups.get(key).versions.push(torrent)
  })
  return [...groups.values()]
}

export const fileLabel = (file, episodeLabel) =>
  file.episode ? `${episodeLabel} ${String(file.episode).padStart(2, '0')}` : file.path.split(/[\\/]/).pop()

export const readLocalProgress = id => {
  try {
    const value = JSON.parse(
      window.AndroidTorrServer?.progress?.(id) || localStorage.getItem(`cinema.progress.${id}`) || 'null',
    )
    return value && Number.isFinite(value.position) && value.position >= 0 ? value : null
  } catch (_) {
    return null
  }
}
