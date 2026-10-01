import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import {
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Typography,
  Divider,
  ListItemSecondaryAction,
  IconButton,
  Snackbar,
  useMediaQuery,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@material-ui/core'
import { CloudDownload as DownloadIcon, ArrowUpward, ArrowDownward } from '@material-ui/icons'
import { torznabSearchHost, torrentsHost, settingsHost, searchHost } from 'utils/Hosts'
import useOnStandaloneAppOutsideClick from 'utils/useOnStandaloneAppOutsideClick'
import { StyledDialog, StyledHeader } from 'style/CustomMaterialUiStyles'
import { parseSizeToBytes, formatSizeToClassicUnits } from 'utils/Utils'
import { getMoviePosters, shortenTitleForPosterSearch } from 'components/Add/helpers'

import { Content, Footer } from './style'

export default function SearchDialog({ handleClose, initialQuery = '', autoSearch = false }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [adding, setAdding] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [searchError, setSearchError] = useState('')
  const [trackers, setTrackers] = useState([])
  const [settingsReady, setSettingsReady] = useState(false)
  const [settingsAttempt, setSettingsAttempt] = useState(0)
  const [enableRutor, setEnableRutor] = useState(false)
  const [selectedTracker, setSelectedTracker] = useState(-1)
  const [sortField, setSortField] = useState('') // '', 'size', 'seeds', 'peers'
  const [sortDirection, setSortDirection] = useState('desc') // 'asc' or 'desc'
  const fullScreen = useMediaQuery('@media (max-width:930px)')
  const isMobile = useMediaQuery('(max-width:600px)')
  const ref = useOnStandaloneAppOutsideClick(handleClose)
  const searchRequestRef = useRef({ id: 0, controller: null })

  useEffect(() => {
    const controller = new AbortController()
    setSearchError('')
    axios
      .post(settingsHost(), { action: 'get' }, { signal: controller.signal, timeout: 8000 })
      .then(({ data }) => {
        if (!data || controller.signal.aborted) return
        const configured = data.TorznabUrls || []
        setTrackers(configured)
        setEnableRutor(!!data.EnableRutorSearch)
        setSelectedTracker(!configured.length && data.EnableRutorSearch ? 'rutor' : -1)
        setSettingsReady(true)
      })
      .catch(error => {
        if (error.code !== 'ERR_CANCELED') setSearchError(t('Torznab.SettingsFailed'))
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsAttempt])

  useEffect(
    () => () => {
      searchRequestRef.current.controller?.abort()
    },
    [],
  )

  const handleSearch = async (searchQuery = query) => {
    const normalizedQuery = typeof searchQuery === 'string' ? searchQuery.trim() : query.trim()
    if (!normalizedQuery || !settingsReady) return
    setQuery(normalizedQuery)
    setLoading(true)
    setSearched(true)
    setResults([])
    setSearchError('')
    searchRequestRef.current.controller?.abort()
    const requestId = searchRequestRef.current.id + 1
    const controller = new AbortController()
    searchRequestRef.current = { id: requestId, controller }
    try {
      let url = torznabSearchHost()
      const params = { query: normalizedQuery }

      if (selectedTracker === 'rutor') {
        url = searchHost()
      } else if (selectedTracker !== -1) {
        params.index = selectedTracker
      }

      const { data } = await axios.get(url, {
        params,
        signal: controller.signal,
        timeout: 25000,
      })
      if (!Array.isArray(data)) throw new Error('Invalid search response')
      if (searchRequestRef.current.id === requestId) {
        setResults(data || [])
      }
    } catch (error) {
      if (error.code !== 'ERR_CANCELED' && searchRequestRef.current.id === requestId) {
        setSearchError(
          t(
            error.code === 'ECONNABORTED' || error.response?.status === 504
              ? 'Torznab.SearchTimeout'
              : 'Torznab.SearchFailed',
          ),
        )
      }
    } finally {
      if (searchRequestRef.current.id === requestId) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!initialQuery || !settingsReady) return
    setQuery(initialQuery)
    if (autoSearch) {
      handleSearch(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, autoSearch, settingsReady])

  const handleKeyDown = e => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleAdd = async item => {
    setAdding(true)
    try {
      const link = item.Magnet || item.Link
      if (!link) {
        setErrorMsg(t('Torznab.NoLinkFound'))
        return
      }
      let poster = item.Poster
      if (!poster && item.Title) {
        const query = shortenTitleForPosterSearch(item.Title)
        if (query) {
          const urlList = await getMoviePosters(query, 'en')
          const [firstPosterUrl] = urlList || []
          if (firstPosterUrl) poster = firstPosterUrl
        }
      }
      await axios.post(torrentsHost(), {
        action: 'add',
        link,
        title: item.Title,
        save_to_db: true,
        poster: poster || '',
      })
      setSuccessMsg(t('Torznab.TorrentAddedSuccessfully'))
    } catch (error) {
      setErrorMsg(t('Torznab.FailedToAddTorrent'))
    } finally {
      setAdding(false)
    }
  }

  const handleAlertClose = (event, reason) => {
    if (reason === 'clickaway') {
      return
    }
    setSuccessMsg('')
    setErrorMsg('')
  }

  const toggleSortDirection = () => {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const sortedResults = useMemo(() => {
    if (!sortField || results.length === 0) return results

    const sorted = [...results].sort((a, b) => {
      let aVal
      let bVal

      switch (sortField) {
        case 'size':
          aVal = parseSizeToBytes(a.Size || '0')
          bVal = parseSizeToBytes(b.Size || '0')
          break
        case 'seeds':
          aVal = a.Seed || 0
          bVal = b.Seed || 0
          break
        case 'peers':
          aVal = a.Peer || 0
          bVal = b.Peer || 0
          break
        default:
          return 0
      }

      if (aVal === bVal) return 0
      return sortDirection === 'asc' ? (aVal < bVal ? -1 : 1) : aVal > bVal ? -1 : 1
    })

    return sorted
  }, [results, sortField, sortDirection])

  return (
    <StyledDialog
      className='cinema-dialog cinema-search-dialog'
      open
      onClose={handleClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth='md'
      ref={ref}
    >
      <StyledHeader>{t('Torznab.SearchTorrents')}</StyledHeader>
      <Content aria-busy={loading}>
        <div className='search-body'>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '20px',
              alignItems: 'flex-start',
              flexWrap: fullScreen ? 'wrap' : 'nowrap',
            }}
          >
            <FormControl
              variant='outlined'
              size='small'
              style={{
                minWidth: 150,
                flex: fullScreen ? '1 1 100%' : '0 0 auto',
              }}
            >
              <InputLabel>{t('Tracker')}</InputLabel>
              <Select value={selectedTracker} onChange={e => setSelectedTracker(e.target.value)} label={t('Tracker')}>
                <MenuItem value={-1}>{t('Torznab.ConfiguredTrackers')}</MenuItem>
                {enableRutor && <MenuItem value='rutor'>{t('Rutor')}</MenuItem>}
                {trackers.map((tracker, index) => (
                  <MenuItem key={`${tracker.Host}-${tracker.Name}`} value={index}>
                    {tracker.Name || tracker.Host}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={t('Torznab.SearchMoviesShows')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              variant='outlined'
              size='small'
              fullWidth
              placeholder={t('Torznab.SearchMoviesShows')}
              autoFocus
            />
            <Button
              variant='contained'
              color='primary'
              onClick={() => handleSearch()}
              disabled={loading || !settingsReady || !query.trim()}
              style={{
                minWidth: fullScreen ? '80px' : '100px',
                height: '40px',
              }}
            >
              {loading ? <CircularProgress size={24} color='inherit' /> : t('Search')}
            </Button>
          </div>

          {searched && results.length > 0 && (
            <div
              className='search-sort-controls'
              style={{
                display: 'flex',
                gap: isMobile ? '8px' : '4px',
                marginBottom: '16px',
                alignItems: 'center',
                padding: isMobile ? '12px 8px' : '8px 12px',
                borderRadius: '4px',
                flexWrap: isMobile ? 'wrap' : 'nowrap',
              }}
            >
              <FormControl
                variant='outlined'
                size='small'
                style={{
                  minWidth: isMobile ? '100%' : 140,
                  flexShrink: 0,
                  flex: isMobile ? '1 1 100%' : '0 0 auto',
                }}
              >
                <InputLabel>{t('Torznab.SortBy')}</InputLabel>
                <Select value={sortField} onChange={e => setSortField(e.target.value)} label={t('Torznab.SortBy')}>
                  <MenuItem value=''>{t('Torznab.SortByNone')}</MenuItem>
                  <MenuItem value='size'>{t('Torznab.SortBySize')}</MenuItem>
                  <MenuItem value='seeds'>{t('Torznab.SortBySeeds')}</MenuItem>
                  <MenuItem value='peers'>{t('Torznab.SortByPeers')}</MenuItem>
                </Select>
              </FormControl>
              {sortField && (
                <IconButton
                  size='small'
                  onClick={toggleSortDirection}
                  title={sortDirection === 'asc' ? t('Torznab.SortAscending') : t('Torznab.SortDescending')}
                  style={{
                    marginLeft: isMobile ? 'auto' : '4px',
                    padding: '8px',
                  }}
                >
                  {sortDirection === 'asc' ? <ArrowUpward /> : <ArrowDownward />}
                </IconButton>
              )}
            </div>
          )}

          <div className='search-results'>
            {loading && (
              <div className='search-state' role='status'>
                <CircularProgress color='primary' size={32} />
                <Typography>{t('Torznab.WaitingForTracker')}</Typography>
                <Button
                  onClick={() => {
                    searchRequestRef.current.controller?.abort()
                    setLoading(false)
                    setSearched(false)
                  }}
                >
                  {t('Torznab.CancelSearch')}
                </Button>
              </div>
            )}

            {!loading && searchError && (
              <div className='search-state search-error' role='alert'>
                {searchError}
                <Button onClick={() => (settingsReady ? handleSearch() : setSettingsAttempt(value => value + 1))}>
                  {t('Torznab.RetrySearch')}
                </Button>
              </div>
            )}

            {searched && results.length === 0 && !loading && !searchError && (
              <Typography className='search-state' align='center' variant='body1' color='textSecondary'>
                {t('Torznab.NoResultsFound')}
              </Typography>
            )}

            <List>
              {sortedResults.map((item, index) => {
                const sizeBytes = parseSizeToBytes(item.Size || '0')
                const formattedSize = formatSizeToClassicUnits(sizeBytes)
                return (
                  <div key={item.Hash || item.Link || index}>
                    <ListItem button onClick={() => handleAdd(item)}>
                      <ListItemText
                        primary={item.Title}
                        secondary={
                          <>
                            <Typography component='span' variant='body2' color='textPrimary'>
                              {formattedSize}
                            </Typography>
                            {` • S: ${item.Seed || 0} P: ${item.Peer || 0}`}
                          </>
                        }
                        primaryTypographyProps={{
                          style: {
                            whiteSpace: isMobile ? 'normal' : 'inherit',
                            fontSize: isMobile ? '0.9rem' : 'inherit',
                          },
                        }}
                        secondaryTypographyProps={{
                          style: {
                            fontSize: isMobile ? '0.75rem' : 'inherit',
                          },
                        }}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge='end'
                          aria-label='add'
                          onClick={() => handleAdd(item)}
                          disabled={adding}
                          size={isMobile ? 'small' : 'medium'}
                        >
                          <DownloadIcon color='secondary' />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                    <Divider component='li' />
                  </div>
                )
              })}
            </List>
          </div>
        </div>
      </Content>

      <Snackbar open={!!successMsg} autoHideDuration={1500} onClose={handleAlertClose} message={successMsg} />
      <Snackbar open={!!errorMsg} autoHideDuration={1500} onClose={handleAlertClose} message={errorMsg} />

      <Footer>
        <Button onClick={handleClose} color='secondary' variant='outlined'>
          {t('Close')}
        </Button>
      </Footer>
    </StyledDialog>
  )
}
