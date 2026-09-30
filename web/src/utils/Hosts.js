const { protocol, hostname, port } = window.location

let torrserverHost = process.env.REACT_APP_SERVER_HOST || `${protocol}//${hostname}${port ? `:${port}` : ''}`

export const torrentsHost = () => `${torrserverHost}/torrents`
export const viewedHost = () => `${torrserverHost}/viewed`
export const cacheHost = () => `${torrserverHost}/cache`
export const torrentUploadHost = () => `${torrserverHost}/torrent/upload`
export const settingsHost = () => `${torrserverHost}/settings`
export const streamHost = () => `${torrserverHost}/stream`
export const shutdownHost = () => `${torrserverHost}/shutdown`
export const echoHost = () => `${torrserverHost}/echo`
export const playlistTorrHost = () => `${torrserverHost}/stream`
export const torznabSearchHost = () => `${torrserverHost}/torznab/search`
export const searchHost = () => `${torrserverHost}/search`
export const torznabTestHost = () => `${torrserverHost}/torznab/test`
export const tmdbSettingsHost = () => `${torrserverHost}/tmdb/settings`
export const postersSearchHost = () => `${torrserverHost}/posters/search`
export const discoverySearchHost = () => `${torrserverHost}/discover/search`
export const discoveryGenresHost = () => `${torrserverHost}/discover/genres`
export const discoveryDetailsHost = () => `${torrserverHost}/discover/details`
export const offlineHost = () => `${torrserverHost}/offline`
export const offlineStatusHost = hash => `${torrserverHost}/offline/${hash}`
export const offlineStreamHost = (hash, id, path = '') =>
  `${torrserverHost}/offline/stream/${hash}/${id}/${encodeURIComponent(path.split('\\').pop().split('/').pop())}`

export const getTorrServerHost = () => torrserverHost
export const setTorrServerHost = host => {
  torrserverHost = host
}
