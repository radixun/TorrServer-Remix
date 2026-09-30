import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import ptt from 'parse-torrent-title'
import { checkImageURL, getMoviePosters } from 'components/Add/helpers'

import { torrentsHost } from './Hosts'
import { removeRedundantCharacters } from './Utils'

const BACKFILL_PAUSE_MS = 2500

const cleanSearchTitle = value => {
  const parsedTitle = ptt.parse(value || '')?.title || value || ''
  return removeRedundantCharacters(parsedTitle)
    .replace(/[._]+/g, ' ')
    .replace(/\b(2160p|1080p|720p|web[- ]?dl|bdrip|webrip|hdr|dv|hevc|x264|x265|aac|ddp[a-z0-9.]*)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const getRawTitleParts = value => {
  const rawTitle = `${value || ''}`.trim()
  const dottedTitles = rawTitle.match(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g) || []
  const slashParts = rawTitle.split('/').map(part => part.trim())

  return [...dottedTitles, ...slashParts, rawTitle].filter(Boolean)
}

const getTitleVariants = value => {
  const cleanedTitle = cleanSearchTitle(value)

  return [
    value,
    cleanedTitle,
    cleanedTitle.replace(/\bS\d{1,2}\b.*$/i, '').trim(),
    cleanedTitle.replace(/\bSeason\s*\d{1,2}\b.*$/i, '').trim(),
    cleanedTitle.replace(/\s*\((19|20)\d{2}\).*$/i, '').trim(),
  ].filter(Boolean)
}

const getSearchTitles = torrent => {
  const titles = [torrent.title, torrent.name].flatMap(getRawTitleParts).flatMap(getTitleVariants).filter(Boolean)
  return [...new Set(titles)]
}

const findPoster = async (titles, language) => {
  const languages = language === 'en' ? ['en', 'ru'] : [language, 'en']

  for (const title of titles) {
    for (const lang of languages) {
      // Search sequentially to avoid sending a burst of TMDB requests.
      // eslint-disable-next-line no-await-in-loop
      const posters = await getMoviePosters(title, lang)
      const poster = posters?.[0]
      // eslint-disable-next-line no-await-in-loop
      if (await checkImageURL(poster)) return poster
    }
  }

  return ''
}

export default function usePosterBackfill({ torrents, currentLang, isOffline, isLoading }) {
  const attemptedHashes = useRef(new Set())
  const inFlight = useRef(false)
  const lastRunAt = useRef(0)
  const [runToken, setRunToken] = useState(0)

  useEffect(() => {
    if (isOffline || isLoading || inFlight.current || !torrents?.length) return

    const now = Date.now()
    if (now - lastRunAt.current < BACKFILL_PAUSE_MS) return

    const candidate = torrents.find(({ hash, poster, title, name }) => {
      if (!hash || poster || attemptedHashes.current.has(hash)) return false
      return getSearchTitles({ title, name }).length > 0
    })

    if (!candidate) return

    const titles = getSearchTitles(candidate)
    const language = currentLang === 'ru' ? 'ru' : 'en'
    attemptedHashes.current.add(candidate.hash)
    inFlight.current = true
    lastRunAt.current = now

    findPoster(titles, language)
      .then(poster => {
        if (!poster) return null

        return axios.post(torrentsHost(), {
          action: 'set',
          hash: candidate.hash,
          title: candidate.title || candidate.name || titles[0],
          category: candidate.category || '',
          poster,
        })
      })
      .finally(() => {
        inFlight.current = false
        setTimeout(() => setRunToken(value => value + 1), BACKFILL_PAUSE_MS)
      })
  }, [currentLang, isLoading, isOffline, runToken, torrents])
}
