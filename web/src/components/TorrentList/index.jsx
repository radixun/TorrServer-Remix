import TorrentCard from 'components/TorrentCard'
import CircularProgress from '@material-ui/core/CircularProgress'
import { TorrentListWrapper, CenteredGrid } from 'components/App/style'
import { useTranslation } from 'react-i18next'

import NoServerConnection from './NoServerConnection'
import AddFirstTorrent from './AddFirstTorrent'

export default function TorrentList({
  isOffline,
  isLoading,
  sortABC,
  torrents,
  sortCategory,
  genreFilter,
  genreMaps,
  locale,
}) {
  const { t } = useTranslation()
  const libraryTorrents = Array.isArray(torrents) ? torrents : []

  if (isLoading || isOffline || !libraryTorrents.length) {
    return (
      <CenteredGrid>
        {isOffline ? (
          <NoServerConnection />
        ) : isLoading ? (
          <CircularProgress color='secondary' />
        ) : (
          !libraryTorrents.length && <AddFirstTorrent />
        )}
      </CenteredGrid>
    )
  }

  const filteredTorrents = libraryTorrents.filter(
    torrent =>
      (sortCategory === 'all' || torrent.category === sortCategory) &&
      (!genreFilter || getTorrentGenres(torrent, genreMaps).includes(genreFilter)),
  )
  const visibleTorrents = sortABC
    ? [...filteredTorrents].sort((a, b) =>
        String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), locale, {
          numeric: true,
          sensitivity: 'base',
        }),
      )
    : filteredTorrents

  if (!visibleTorrents.length) {
    return (
      <CenteredGrid>
        <div role='status'>{t('Discovery.NoResults')}</div>
      </CenteredGrid>
    )
  }

  return (
    <TorrentListWrapper>
      {visibleTorrents.map(torrent => (
        <TorrentCard key={torrent.hash} torrent={torrent} genreMaps={genreMaps} />
      ))}
    </TorrentListWrapper>
  )
}

const getTorrentGenres = (torrent, genreMaps) => {
  try {
    const metadata = torrent?.data ? JSON.parse(torrent.data)?.TorrServer?.Metadata || {} : {}
    const tmdbMetadata = metadata.tmdb || metadata.TMDB || {}
    const genreMap = genreMaps[tmdbMetadata.media_type || torrent?.category] || {}
    return (tmdbMetadata.genre_ids || tmdbMetadata.GenreIDs || []).map(id => genreMap[String(id)]).filter(Boolean)
  } catch (error) {
    return []
  }
}
