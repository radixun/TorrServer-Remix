import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheHost, offlineStatusHost, settingsHost } from 'utils/Hosts'
import axios from 'axios'

export const useUpdateCache = hash => {
  const [cache, setCache] = useState({})
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const hasCache = useRef(false)

  const retry = useCallback(() => setRetryCount(value => value + 1), [])

  useEffect(() => {
    let cancelled = false
    let timerID
    let controller

    hasCache.current = false
    setCache({})
    setError('')

    if (!hash) {
      setStatus('idle')
      return undefined
    }

    setStatus('loading')

    const update = async () => {
      controller = new AbortController()

      try {
        const { data } = await axios.post(
          cacheHost(),
          { action: 'get', hash },
          { signal: controller.signal, timeout: 5000 },
        )
        if (cancelled) return

        hasCache.current = true
        setCache(data || {})
        setError('')
        setStatus('ready')
      } catch (requestError) {
        if (cancelled || requestError?.code === 'ERR_CANCELED') return

        setError(requestError?.response?.data?.error || requestError.message)
        setStatus(hasCache.current ? 'ready' : 'error')
      } finally {
        // Schedule only after the current request settles so slow requests never overlap.
        if (!cancelled) timerID = setTimeout(update, 900)
      }
    }

    update()

    return () => {
      cancelled = true
      clearTimeout(timerID)
      controller?.abort()
    }
  }, [hash, retryCount])

  return { cache, error, retry, status }
}

export const useCreateCacheMap = cache => {
  const [cacheMap, setCacheMap] = useState([])

  useEffect(() => {
    const { PiecesCount, Pieces, Readers } = cache

    const map = []

    for (let i = 0; i < PiecesCount; i++) {
      const { Size, Length, Priority } = Pieces[i] || {}

      const newPiece = {
        id: i,
        percentage: (Size / Length) * 100 || 0,
        priority: Priority || 0,
      }

      Readers.forEach(r => {
        if (i === r.Reader) newPiece.isReader = true
        if (i >= r.Start && i < r.End) newPiece.isReaderRange = true
      })

      map.push(newPiece)
    }
    setCacheMap(map)
  }, [cache])

  return cacheMap
}

export const useGetSettings = cache => {
  const [settings, setSettings] = useState()
  useEffect(() => {
    axios.post(settingsHost(), { action: 'get' }).then(({ data }) => setSettings(data))
  }, [cache])

  return settings
}

export const useOfflineStatus = hash => {
  const [status, setStatus] = useState({
    state: 'not_downloaded',
    enabled: false,
    available: false,
  })

  useEffect(() => {
    let mounted = true
    const update = () => {
      if (!hash) return
      axios
        .get(offlineStatusHost(hash))
        .then(({ data }) => mounted && setStatus(data))
        .catch(error => {
          if (!mounted) return
          setStatus({
            state: 'unavailable',
            enabled: true,
            available: false,
            error: error?.response?.data?.error || error.message,
          })
        })
    }

    update()
    const timerID = setInterval(update, 1000)
    return () => {
      mounted = false
      clearInterval(timerID)
    }
  }, [hash])

  return [status, setStatus]
}
