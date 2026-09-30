import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import {
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@material-ui/core'
import {
  Info as InfoIcon,
  Movie as MovieIcon,
  Search as SearchIcon,
  Star as StarIcon,
  Theaters as TheatersIcon,
} from '@material-ui/icons'
import { discoveryDetailsHost, discoveryGenresHost, discoverySearchHost } from 'utils/Hosts'

import { DiscoveryDetailsDialog, DiscoveryWrapper } from './style'

const currentYear = new Date().getFullYear()

const mediaTypes = [
  { value: 'movie', labelKey: 'Discovery.Movies' },
  { value: 'tv', labelKey: 'Discovery.Series' },
]

const newestSortByMediaType = {
  movie: 'primary_release_date.desc',
  tv: 'first_air_date.desc',
}

const posterKey = item => `${item?.mediaType || 'movie'}-${item?.id}-${item?.poster || 'empty'}`

export default function DiscoveryPage({ language, onFindTorrent }) {
  const { t } = useTranslation()
  const [mediaType, setMediaType] = useState('movie')
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('')
  const [yearFrom, setYearFrom] = useState(String(currentYear - 2))
  const [yearTo, setYearTo] = useState(String(currentYear))
  const [sortBy, setSortBy] = useState('popularity.desc')
  const [genres, setGenres] = useState([])
  const [results, setResults] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [failedPosters, setFailedPosters] = useState({})
  const searchRequestRef = useRef({ id: 0, controller: null })
  const detailsRequestRef = useRef({ id: 0, controller: null })

  const sortOptions = useMemo(
    () => [
      { value: 'popularity.desc', label: t('Discovery.SortPopular') },
      { value: 'vote_average.desc', label: t('Discovery.SortRating') },
      {
        value: newestSortByMediaType[mediaType],
        label: t('Discovery.SortNewest'),
      },
    ],
    [mediaType, t],
  )

  useEffect(() => {
    setGenre('')
    const controller = new AbortController()
    axios
      .get(discoveryGenresHost(), {
        params: { media_type: mediaType, language },
        signal: controller.signal,
      })
      .then(({ data }) => setGenres(data.genres || []))
      .catch(err => {
        if (err.code !== 'ERR_CANCELED') setGenres([])
      })

    return () => controller.abort()
  }, [mediaType, language])

  useEffect(() => {
    handleSearch(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => () => {
      searchRequestRef.current.controller?.abort()
      detailsRequestRef.current.controller?.abort()
    },
    [],
  )

  const handleSearch = async nextPage => {
    searchRequestRef.current.controller?.abort()
    const requestId = searchRequestRef.current.id + 1
    const controller = new AbortController()
    searchRequestRef.current = { id: requestId, controller }
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get(discoverySearchHost(), {
        params: {
          media_type: mediaType,
          query: query.trim(),
          genre,
          year_from: query.trim() ? '' : yearFrom,
          year_to: query.trim() ? '' : yearTo,
          sort_by: sortBy,
          page: nextPage,
          language,
        },
        signal: controller.signal,
      })
      if (searchRequestRef.current.id === requestId) {
        setResults(data.results || [])
        setPage(data.page || nextPage)
        setTotalPages(data.totalPages || 1)
        setError(data.error || '')
      }
    } catch (err) {
      if (err.code !== 'ERR_CANCELED' && searchRequestRef.current.id === requestId) {
        setError(t('Discovery.SearchFailed'))
        setResults([])
      }
    } finally {
      if (searchRequestRef.current.id === requestId) {
        setLoading(false)
      }
    }
  }

  const handleOpenDetails = async item => {
    detailsRequestRef.current.controller?.abort()
    const requestId = detailsRequestRef.current.id + 1
    const controller = new AbortController()
    detailsRequestRef.current = { id: requestId, controller }
    setSelected(item)
    setDetailsLoading(true)
    try {
      const { data } = await axios.get(discoveryDetailsHost(), {
        params: {
          id: item.id,
          media_type: item.mediaType || mediaType,
          language,
        },
        signal: controller.signal,
      })
      if (!data.error && detailsRequestRef.current.id === requestId) {
        setSelected({ ...item, ...data })
      }
    } catch (err) {
      if (err.code !== 'ERR_CANCELED' && detailsRequestRef.current.id === requestId) {
        setSelected(item)
      }
    } finally {
      if (detailsRequestRef.current.id === requestId) {
        setDetailsLoading(false)
      }
    }
  }

  const handleCloseDetails = () => {
    detailsRequestRef.current.controller?.abort()
    detailsRequestRef.current = { id: detailsRequestRef.current.id + 1, controller: null }
    setDetailsLoading(false)
    setSelected(null)
  }

  const handleMediaTypeChange = event => {
    const nextMediaType = event.target.value
    setMediaType(nextMediaType)
    setSortBy(currentSort =>
      Object.values(newestSortByMediaType).includes(currentSort) ? newestSortByMediaType[nextMediaType] : currentSort,
    )
  }

  const handlePosterError = item => {
    const key = posterKey(item)
    setFailedPosters(current => (current[key] ? current : { ...current, [key]: true }))
  }

  const buildSearchTitle = item => {
    if (!item) return ''
    const title =
      item.originalName && /[A-Za-z]/.test(item.originalName) ? item.originalName : item.title || item.originalName
    const year = releaseYear(item)
    return [title, year].filter(Boolean).join(' ')
  }

  const releaseYear = item => (item.releaseDate ? item.releaseDate.slice(0, 4) : '')
  const mediaTypeLabel = item => (item && item.mediaType === 'tv' ? t('Discovery.Series') : t('Discovery.Movies'))
  const trailer =
    (selected && selected.videos && selected.videos.find(video => video.type === 'Trailer')) ||
    (selected && selected.videos && selected.videos[0])

  return (
    <DiscoveryWrapper>
      <div className='discover-toolbar'>
        <TextField
          label={t('Discovery.Query')}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !loading) handleSearch(1)
          }}
          variant='outlined'
          size='small'
          disabled={loading}
        />
        <FormControl variant='outlined' size='small' disabled={loading}>
          <InputLabel>{t('Discovery.Type')}</InputLabel>
          <Select value={mediaType} onChange={handleMediaTypeChange} label={t('Discovery.Type')}>
            {mediaTypes.map(item => (
              <MenuItem key={item.value} value={item.value}>
                {t(item.labelKey)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl variant='outlined' size='small' disabled={loading}>
          <InputLabel>{t('Discovery.Genre')}</InputLabel>
          <Select value={genre} onChange={event => setGenre(event.target.value)} label={t('Discovery.Genre')}>
            <MenuItem value=''>{t('All')}</MenuItem>
            {genres.map(item => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label={t('Discovery.YearFrom')}
          value={yearFrom}
          onChange={event => setYearFrom(event.target.value.replace(/\D/g, '').slice(0, 4))}
          variant='outlined'
          size='small'
          disabled={loading || !!query.trim()}
        />
        <TextField
          label={t('Discovery.YearTo')}
          value={yearTo}
          onChange={event => setYearTo(event.target.value.replace(/\D/g, '').slice(0, 4))}
          variant='outlined'
          size='small'
          disabled={loading || !!query.trim()}
        />
        <FormControl variant='outlined' size='small' disabled={loading}>
          <InputLabel>{t('Discovery.Sort')}</InputLabel>
          <Select value={sortBy} onChange={event => setSortBy(event.target.value)} label={t('Discovery.Sort')}>
            {sortOptions.map(item => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </div>

      <div className='discover-actions'>
        <Button
          variant='contained'
          color='primary'
          startIcon={<SearchIcon />}
          disabled={loading}
          onClick={() => handleSearch(1)}
        >
          {t('Search')}
        </Button>
        <Button
          variant='outlined'
          color='secondary'
          disabled={page <= 1 || loading}
          onClick={() => handleSearch(page - 1)}
        >
          {t('Discovery.Prev')}
        </Button>
        <Button
          variant='outlined'
          color='secondary'
          disabled={page >= totalPages || loading}
          onClick={() => handleSearch(page + 1)}
        >
          {t('Discovery.Next')}
        </Button>
      </div>

      {loading ? (
        <div className='discover-state'>
          <CircularProgress color='secondary' />
        </div>
      ) : error ? (
        <div className='discover-state'>{error}</div>
      ) : results.length === 0 ? (
        <div className='discover-state'>{t('Discovery.NoResults')}</div>
      ) : (
        <div className='discover-grid'>
          {results.map(item => (
            <article className='discover-card' key={`${item.mediaType}-${item.id}`}>
              {item.poster && !failedPosters[posterKey(item)] ? (
                <img
                  className='discover-poster'
                  src={item.poster}
                  alt={item.title}
                  loading='lazy'
                  onError={() => handlePosterError(item)}
                />
              ) : (
                <div className='discover-empty-poster'>
                  {item.mediaType === 'tv' ? <TheatersIcon /> : <MovieIcon />}
                </div>
              )}
              <div className='discover-card-body'>
                <div>
                  <div className='discover-title'>{item.title}</div>
                  <div className='discover-meta'>
                    {releaseYear(item)} {item.mediaType === 'tv' ? t('Discovery.Series') : t('Discovery.Movies')}
                  </div>
                </div>
                <div className='discover-rating'>
                  <StarIcon fontSize='small' /> <strong>{item.voteAverage ? item.voteAverage.toFixed(1) : '-'}</strong>{' '}
                  TMDB
                </div>
                <div className='discover-overview'>{item.overview || t('Discovery.NoOverview')}</div>
                <div className='discover-card-actions'>
                  <Button
                    variant='outlined'
                    color='secondary'
                    size='small'
                    startIcon={<InfoIcon />}
                    onClick={() => handleOpenDetails(item)}
                  >
                    {t('Details')}
                  </Button>
                  <Button
                    variant='contained'
                    color='primary'
                    size='small'
                    startIcon={<SearchIcon />}
                    onClick={() => onFindTorrent(buildSearchTitle(item))}
                  >
                    {t('Discovery.FindTorrent')}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <DiscoveryDetailsDialog open={!!selected} onClose={handleCloseDetails} fullWidth maxWidth='lg'>
        {selected && (
          <>
            <DialogContent className='discover-detail-content'>
              <div className='discover-detail-shell'>
                <aside className='discover-detail-side'>
                  {selected.poster && !failedPosters[posterKey(selected)] ? (
                    <img
                      className='discover-detail-poster'
                      src={selected.poster}
                      alt={selected.title}
                      onError={() => handlePosterError(selected)}
                    />
                  ) : (
                    <div className='discover-detail-poster discover-detail-poster-empty'>
                      {selected.mediaType === 'tv' ? <TheatersIcon /> : <MovieIcon />}
                    </div>
                  )}
                </aside>

                <section className='discover-detail-main'>
                  <div className='discover-detail-header'>
                    <div>
                      <Typography variant='h4' className='discover-detail-title'>
                        {selected.title}
                      </Typography>
                      {selected.originalName && selected.originalName !== selected.title && (
                        <div className='discover-detail-original'>{selected.originalName}</div>
                      )}
                    </div>
                    {detailsLoading && <CircularProgress color='secondary' size={28} />}
                  </div>

                  <div className='discover-detail-facts'>
                    <span>{mediaTypeLabel(selected)}</span>
                    {releaseYear(selected) && <span>{releaseYear(selected)}</span>}
                    {selected.runtime && (
                      <span>
                        {selected.runtime} {t('Discovery.Minutes')}
                      </span>
                    )}
                  </div>

                  <Typography component='p' className='discover-detail-overview'>
                    {selected.overview || t('Discovery.NoOverview')}
                  </Typography>

                  {(selected.ratings || []).length > 0 && (
                    <div className='discover-detail-links'>
                      {selected.ratings.map(rating => (
                        <Button
                          key={`${rating.source}-${rating.value}`}
                          component={rating.url ? 'a' : 'button'}
                          href={rating.url}
                          target='_blank'
                          rel='noreferrer'
                          variant='outlined'
                          color='secondary'
                          size='small'
                        >
                          {rating.source}: {rating.value}
                        </Button>
                      ))}
                    </div>
                  )}

                  {trailer && (
                    <div className='discover-trailer-panel'>
                      <iframe
                        className='discover-video'
                        title={trailer.name}
                        src={`https://www.youtube.com/embed/${trailer.key}`}
                        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                        allowFullScreen
                      />
                    </div>
                  )}
                </section>
              </div>
            </DialogContent>
            <DialogActions className='discover-detail-actions'>
              <Button onClick={() => onFindTorrent(buildSearchTitle(selected))} color='primary' variant='contained'>
                {t('Discovery.FindTorrent')}
              </Button>
              <Button onClick={handleCloseDetails} color='secondary' variant='outlined'>
                {t('Close')}
              </Button>
            </DialogActions>
          </>
        )}
      </DiscoveryDetailsDialog>
    </DiscoveryWrapper>
  )
}
