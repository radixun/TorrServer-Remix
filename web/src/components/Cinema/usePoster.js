import { useState } from 'react'

import { torrentData } from './media'

// Preserve the chosen cover; use the title's existing metadata if that host fails.
export default function usePoster(torrent) {
  const [failed, setFailed] = useState([])
  const metadata = torrentData(torrent).Metadata || {}
  const src = [torrent.poster, metadata.tmdb?.poster, metadata.TMDB?.poster].find(
    url => /^https?:\/\//i.test(url || '') && !failed.includes(url),
  )
  return { src, onError: () => setFailed(previous => [...previous, src]) }
}
