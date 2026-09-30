import axios from 'axios'
import parseTorrent from 'parse-torrent'
import ptt from 'parse-torrent-title'
import { postersSearchHost, tmdbSettingsHost } from 'utils/Hosts'

// Cache for TMDB settings to avoid repeated API calls
let tmdbSettingsCache = null

// Clear TMDB settings cache - call this when settings are updated
export const clearTMDBCache = () => {
  tmdbSettingsCache = null
}

// Fetch TMDB settings from backend
const getTMDBSettings = async () => {
  if (tmdbSettingsCache) {
    return tmdbSettingsCache
  }

  try {
    const { data } = await axios.get(tmdbSettingsHost())
    tmdbSettingsCache = data
    return data
  } catch (error) {
    return {
      APIKey: process.env.REACT_APP_TMDB_API_KEY || '',
      APIURL: 'https://api.themoviedb.org/3',
      ImageURL: 'https://image.tmdb.org',
      ImageURLRu: 'https://imagetmdb.com',
    }
  }
}

const withProtocol = value => {
  const normalizedValue = `${value || ''}`.trim()
  if (!normalizedValue) return ''
  if (/^https?:\/\//i.test(normalizedValue)) return normalizedValue
  return `https://${normalizedValue}`
}

const getMoviePostersDirect = async (movieName, language = 'en') => {
  const settings = await getTMDBSettings()

  // If no API key is configured, return null
  if (!settings.APIKey) {
    return null
  }

  // Build API URL - automatically append /3/search/multi
  let apiURL = withProtocol(settings.APIURL).replace(/\/$/, '')

  // If URL doesn't already contain the full path, add /3/search/multi
  if (!apiURL.includes('/3/search/multi')) {
    // Remove any partial paths that might exist
    apiURL = apiURL.replace(/\/3.*$/, '').replace(/\/search.*$/, '')
    apiURL = `${apiURL}/3/search/multi`
  }

  const url = apiURL

  // Build image URL - strip protocol and trailing slash
  const imgHost = withProtocol(language === 'ru' ? settings.ImageURLRu : settings.ImageURL).replace(/\/$/, '')

  return axios
    .get(url, {
      params: {
        api_key: settings.APIKey,
        language,
        include_image_language: `${language},null,en`,
        query: movieName,
      },
    })
    .then(({ data: { results } }) =>
      results.filter(el => el.poster_path).map(el => `${imgHost}/t/p/w300${el.poster_path}`),
    )
    .catch(() => null)
}

export const getMoviePosters = async (movieName, language = 'en') => {
  if (!movieName) return null

  return axios
    .post(postersSearchHost(), { title: movieName, language })
    .then(({ data }) => data?.posters || null)
    .catch(() => getMoviePostersDirect(movieName, language))
}

export const checkImageURL = async url => {
  if (!url || !url.match(/.(\.jpg|\.jpeg|\.png|\.gif|\.svg||\.webp).*$/i)) return false
  return true
}

const magnetRegex = /^magnet:\?xt=urn:[a-z0-9].*/i
export const hashRegex = /^\b[0-9a-f]{32}\b$|^\b[0-9a-f]{40}\b$|^\b[0-9a-f]{64}\b$/i
const torrentRegex = /^.*\.(torrent)$/i
const linkRegex = /^(http(s?)):\/\/.*/i
const torrsRegex = /^(torrs):\/\/.*/i

export const checkTorrentSource = source =>
  source.match(hashRegex) !== null ||
  source.match(magnetRegex) !== null ||
  source.match(torrentRegex) !== null ||
  source.match(linkRegex) !== null ||
  source.match(torrsRegex) !== null

export const parseTorrentTitle = (parsingSource, callback) => {
  parseTorrent.remote(parsingSource, (err, { name, files } = {}) => {
    if (!name || err) return callback({ parsedTitle: null, originalName: null })

    const torrentName = ptt.parse(name).title
    const nameOfFileInsideTorrent = files ? ptt.parse(files[0].name).title : null

    let newTitle = torrentName
    if (nameOfFileInsideTorrent) {
      // taking shorter title because in most cases it is more accurate
      newTitle = torrentName.length < nameOfFileInsideTorrent.length ? torrentName : nameOfFileInsideTorrent
    }

    callback({ parsedTitle: newTitle, originalName: name })
  })
}
