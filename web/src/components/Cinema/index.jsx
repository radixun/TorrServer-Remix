import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'react-query'
import { Drawer, List, ListItem, ListItemText, Divider, CircularProgress } from '@material-ui/core'
import SearchIcon from '@material-ui/icons/Search'
import MenuIcon from '@material-ui/icons/Menu'
import axios from 'axios'
import { torrentsHost, discoveryGenresHost } from 'utils/Hosts'
import useChangeLanguage from 'utils/useChangeLanguage'
import DiscoveryPage from 'components/Discovery'
import AddDialog from 'components/Add/AddDialog'
import SearchDialog from 'components/Search/SearchDialog'
import SettingsDialog from 'components/Settings/SettingsDialog'

import { groupLibrary, mediaTitle, torrentData } from './media'
import PosterCard from './PosterCard'
import TitlePage from './TitlePage'
import Downloads from './Downloads'
import useCinemaText from './text'
import './cinema.css'

const routeFromHash = () => {
  const { hash } = window.location
  if (hash.startsWith('#title/')) return { view: 'title', hash: hash.slice(7) }
  return { view: hash === '#downloads' ? 'downloads' : hash === '#discover' ? 'discover' : 'library' }
}

export default function Cinema() {
  const c = useCinemaText()
  const [language, changeLanguage] = useChangeLanguage()
  useEffect(() => {
    window.AndroidTorrServer?.uiLanguage?.(language?.startsWith('ru') ? 'ru' : 'en')
  }, [language])
  const [route, setRoute] = useState(routeFromHash)
  const [menu, setMenu] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [genre, setGenre] = useState(null)
  const [sort, setSort] = useState(false)
  const [filters, setFilters] = useState(false)
  const [selected, setSelected] = useState(null)
  const scroll = useRef(null)
  const returnTo = useRef(null)
  const previousRoute = useRef(route.view)
  const library = useQuery(
    'torrents',
    ({ signal }) =>
      axios.post(torrentsHost(), { action: 'list' }, { signal, timeout: 8000 }).then(result => result.data || []),
    {
      retry: 1,
      refetchInterval: route.view === 'library' || route.view === 'title' ? 10000 : false,
      refetchIntervalInBackground: false,
    },
  )
  const torrents = Array.isArray(library.data) ? library.data : []
  const genres = useQuery(
    ['cinema-genres', language],
    async ({ signal }) => {
      const responses = await Promise.all(
        ['movie', 'tv'].map(mediaType =>
          axios.get(discoveryGenresHost(), {
            params: { media_type: mediaType, language },
            signal,
            timeout: 8000,
          }),
        ),
      )
      return [
        ...new Map(responses.flatMap(response => response.data.genres || []).map(item => [item.id, item])).values(),
      ]
    },
    { enabled: filters, staleTime: 3600000, retry: false },
  )
  const groups = useMemo(() => groupLibrary(library.data), [library.data])
  const visible = groups.filter(
    value =>
      (category === 'all' || value.torrent.category === category) &&
      (!genre ||
        value.versions.some(torrent => {
          const metadata = torrentData(torrent).Metadata || {}
          const tmdb = metadata.tmdb || metadata.TMDB || {}
          return (tmdb.genre_ids || tmdb.GenreIDs || []).map(Number).includes(genre)
        })),
  )
  if (sort)
    visible.sort((a, b) => mediaTitle(a.torrent).localeCompare(mediaTitle(b.torrent), language, { numeric: true }))
  const group =
    route.view === 'title' ? groups.find(value => value.versions.some(torrent => torrent.hash === route.hash)) : null

  useEffect(() => {
    const sync = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    document.documentElement.dataset.tv = window.AndroidTorrServer ? 'true' : 'false'
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  useLayoutEffect(() => {
    if (route.view === 'library' && previousRoute.current !== 'library' && returnTo.current) {
      const saved = returnTo.current
      requestAnimationFrame(() => {
        scroll.current?.querySelector(`[data-poster-id="${saved.hash}"]`)?.focus({ preventScroll: true })
        if (scroll.current) scroll.current.scrollTop = saved.top
      })
    } else if (previousRoute.current !== route.view && scroll.current) scroll.current.scrollTop = 0
    previousRoute.current = route.view
  }, [route.view])

  const navigate = hash => {
    if (window.location.hash === hash) {
      setMenu(false)
      return
    }
    window.history.pushState(
      { cinema: true, returnHash: window.location.hash },
      '',
      hash || window.location.pathname + window.location.search,
    )
    setRoute(routeFromHash())
    setMenu(false)
  }
  const back = () => {
    if (window.history.state?.cinema) window.history.back()
    else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setRoute(routeFromHash())
    }
  }
  const openTitle = hash => {
    if (route.view === 'library') returnTo.current = { hash, top: scroll.current?.scrollTop || 0 }
    navigate(`#title/${hash}`)
  }
  const openDialog = name => {
    setMenu(false)
    setDialog(name)
  }
  const item = (label, action) => (
    <ListItem button onClick={action}>
      <ListItemText primary={label} />
    </ListItem>
  )

  return (
    <div className={`cinema${route.view === 'title' ? ' cinema-title-view' : ''}`}>
      <header className='cinema-header'>
        <button type='button' className='cinema-home' onClick={() => navigate('')}>
          {c.library}
        </button>
        <button
          type='button'
          className='cinema-search'
          onClick={() => {
            setSearch('')
            openDialog('search')
          }}
        >
          <SearchIcon />
          {c.search}
        </button>
        <button type='button' aria-label={c.menu} aria-expanded={menu} onClick={() => setMenu(true)}>
          <MenuIcon />
        </button>
      </header>
      <main className='cinema-main' ref={scroll}>
        {library.isLoading ? (
          <div className='cinema-empty' role='status'>
            <CircularProgress color='inherit' />
            <p>{c.loading}</p>
          </div>
        ) : library.isError && !torrents.length ? (
          <div className='cinema-empty' role='alert'>
            <h1>{c.offline}</h1>
            <p>{c.offlineText}</p>
            <button className='cinema-button' type='button' onClick={() => library.refetch()}>
              {c.retry}
            </button>
          </div>
        ) : (
          <>
            {library.isError && (
              <p className='cinema-error' role='status'>
                {c.offline}
              </p>
            )}
            {route.view === 'title' &&
              (group ? (
                <TitlePage key={group.key} group={group} initialHash={route.hash} onBack={back} />
              ) : (
                <>
                  <button className='cinema-button' type='button' data-cinema-back onClick={back}>
                    {c.back}
                  </button>
                  <p>{c.noTitle}</p>
                </>
              ))}
            {route.view === 'downloads' && (
              <>
                <button className='cinema-button cinema-back' type='button' data-cinema-back onClick={back}>
                  {c.back}
                </button>
                <Downloads torrents={torrents} onOpen={openTitle} />
              </>
            )}
            {route.view === 'discover' && (
              <>
                <button className='cinema-button cinema-back' type='button' data-cinema-back onClick={back}>
                  {c.back}
                </button>
                <DiscoveryPage
                  language={language}
                  onFindTorrent={query => {
                    setSearch(query)
                    openDialog('search')
                  }}
                />
              </>
            )}
            {route.view === 'library' && (
              <>
                <h1 className='cinema-sr-only'>{c.library}</h1>
                {filters && (
                  <div className='cinema-filter' aria-label={c.filters}>
                    {['all', 'movie', 'tv'].map(value => (
                      <button
                        key={value}
                        type='button'
                        className='cinema-button'
                        aria-pressed={category === value}
                        onClick={() => setCategory(value)}
                      >
                        {c[value]}
                      </button>
                    ))}
                    <button
                      type='button'
                      className='cinema-button'
                      aria-pressed={sort}
                      onClick={() => setSort(value => !value)}
                    >
                      {sort ? c.sort : c.recent}
                    </button>
                    <button type='button' className='cinema-button' onClick={() => setFilters(false)}>
                      {c.close}
                    </button>
                    <div className='cinema-filter' aria-label={c.genre}>
                      <button
                        type='button'
                        className='cinema-button'
                        aria-pressed={!genre}
                        onClick={() => setGenre(null)}
                      >
                        {c.genre}: {c.all}
                      </button>
                      {(genres.data || []).map(value => (
                        <button
                          key={value.id}
                          type='button'
                          className='cinema-button'
                          aria-pressed={genre === value.id}
                          onClick={() => setGenre(value.id)}
                        >
                          {value.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!torrents.length ? (
                  <div className='cinema-empty'>
                    <h1>{c.empty}</h1>
                    <p>{c.emptyText}</p>
                    <button type='button' className='cinema-button primary' onClick={() => openDialog('search')}>
                      {c.search}
                    </button>
                  </div>
                ) : !visible.length ? (
                  <div className='cinema-empty'>
                    <p>{c.noResults}</p>
                    <button
                      type='button'
                      className='cinema-button'
                      onClick={() => {
                        setCategory('all')
                        setGenre(null)
                      }}
                    >
                      {c.clear}
                    </button>
                  </div>
                ) : (
                  <div className='cinema-grid'>
                    {visible.map(value => (
                      <PosterCard
                        key={value.key}
                        group={value}
                        selected={selected === value.key}
                        onSelect={setSelected}
                        onOpen={openTitle}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      <Drawer
        anchor='right'
        open={menu}
        onClose={() => setMenu(false)}
        PaperProps={{ role: 'dialog', 'aria-label': c.menu }}
      >
        <List className='cinema-menu'>
          {item(c.close, () => setMenu(false))}
          <Divider />
          {item(c.downloads, () => navigate('#downloads'))}
          {item(c.discover, () => navigate('#discover'))}
          {item(c.add, () => openDialog('add'))}
          {item(c.filters, () => {
            navigate('')
            setFilters(true)
            setMenu(false)
          })}
          <Divider />
          {item(c.settings, () => openDialog('settings'))}
          {item(language === 'ru' ? 'Interface language: English' : 'Язык интерфейса: Русский', () =>
            changeLanguage(language === 'ru' ? 'en' : 'ru'),
          )}
        </List>
      </Drawer>
      {dialog === 'search' && (
        <SearchDialog handleClose={() => setDialog(null)} initialQuery={search} autoSearch={!!search} />
      )}
      {dialog === 'add' && <AddDialog handleClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog handleClose={() => setDialog(null)} />}
    </div>
  )
}
