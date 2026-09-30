import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'

import { readLocalProgress } from './media'

export const needsBrowserMedia = source => /\.(mkv|avi|m2ts|ts|mpg|mpeg|wmv|mov)(?:\?|$)/i.test(source)
const preference = kind => {
  try {
    return localStorage.getItem(`cinema.${kind}-language`)
  } catch (_) {
    return ''
  }
}

export default function useBrowserMedia({ enabled, source, mediaId, video, onError, retry }) {
  const [session, setSession] = useState(null)
  const [subtitle, setSubtitle] = useState(-1)
  const [caption, setCaption] = useState(null)
  const [captionError, setCaptionError] = useState(false)
  const [captionRetry, setCaptionRetry] = useState(0)
  const captionText = useRef('')
  const current = useRef(null)
  const fail = useRef(onError)
  fail.current = onError
  const controlQueue = useRef(Promise.resolve())

  useEffect(() => {
    setSession(null)
    current.current = null
    setSubtitle(-1)
    setCaption(null)
    if (!enabled) return undefined
    const controller = new AbortController()
    let id
    axios
      .post(
        '/browser-media/session',
        {
          source: new URL(source, window.location.href).pathname + new URL(source, window.location.href).search,
          position: readLocalProgress(mediaId)?.position || 0,
          language: preference('audio'),
        },
        { signal: controller.signal, timeout: 30000 },
      )
      .then(({ data }) => {
        id = data.id
        current.current = data
        setSession(data)
        const preferred = data.subtitles.find(track => track.supported && track.language === preference('subtitles'))
        if (preferred) setSubtitle(preferred.index)
      })
      .catch(error => {
        if (error.code !== 'ERR_CANCELED')
          fail.current(error.response?.data?.error || 'Browser playback service is unavailable')
      })
    const close = () => {
      if (id) navigator.sendBeacon(`/browser-media/${id}/close`, '{}')
    }
    window.addEventListener('pagehide', close)
    return () => {
      controller.abort()
      close()
      window.removeEventListener('pagehide', close)
      current.current = null
    }
  }, [enabled, source, mediaId, retry])

  useEffect(() => {
    if (!session?.url || !video.current) return undefined
    const element = video.current
    let hls
    let disposed = false
    import('hls.js')
      .then(({ default: Hls }) => {
        if (disposed) return
        if (Hls.isSupported()) {
          hls = new Hls({
            startPosition: 0,
            maxBufferLength: 35,
            backBufferLength: 30,
            liveSyncDurationCount: 2,
            liveMaxLatencyDurationCount: 120,
          })
          hls.on(Hls.Events.ERROR, (_, event) => {
            if (event.fatal) fail.current('The video stream was interrupted. Retry playback.')
          })
          hls.loadSource(session.url)
          hls.attachMedia(element)
        } else if (element.canPlayType('application/vnd.apple.mpegurl')) element.src = session.url
        else fail.current('This browser cannot play HLS video')
      })
      .catch(() => fail.current('Could not load the video player'))
    return () => {
      disposed = true
      hls?.destroy()
      element.removeAttribute('src')
      element.load()
    }
  }, [session?.url, video])

  useEffect(() => {
    if (!session?.id) return undefined
    const timer = setInterval(() => {
      const active = current.current
      const element = video.current
      if (!active || !element) return
      axios
        .post(
          `/browser-media/${active.id}/control`,
          {
            position: active.offset + (element.currentTime || 0),
            paused: element.readyState >= 2 && element.paused,
            buffering: element.readyState < 3,
            subtitle,
          },
          { timeout: 8000 },
        )
        .then(({ data }) => {
          if (data.error) fail.current(data.error)
        })
        .catch(() => fail.current('The playback service disconnected. Retry playback.'))
    }, 5000)
    return () => clearInterval(timer)
  }, [session?.id, video, subtitle])

  const control = useCallback(
    payload => {
      // Serialize seeks/track changes so a slow reply cannot attach an obsolete stream.
      controlQueue.current = controlQueue.current
        .catch(() => {})
        .then(async () => {
          const active = current.current
          if (!active) return
          const { data } = await axios.post(`/browser-media/${active.id}/control`, payload, { timeout: 10000 })
          if (current.current?.id !== active.id) return
          video.current?.pause()
          video.current?.removeAttribute('src')
          video.current?.load()
          current.current = data
          setSession(data)
        })
        .catch(error => fail.current(error.response?.data?.error || 'Could not change playback position'))
    },
    [video],
  )
  const seek = absolute => {
    const element = video.current
    const active = current.current
    if (!active || !element) return
    const relative = absolute - active.offset
    for (let i = 0; i < element.seekable.length; i++) {
      if (relative >= element.seekable.start(i) && relative < element.seekable.end(i) - 1) {
        element.currentTime = relative
        return
      }
    }
    control({ seek: absolute, paused: false })
  }
  const selectAudio = index =>
    control({
      audio: index,
      seek: current.current.offset + (video.current?.currentTime || 0),
    })
  useEffect(() => {
    captionText.current = ''
    setCaption(null)
  }, [subtitle, session?.url])
  useEffect(
    () => () => {
      if (caption?.src) URL.revokeObjectURL(caption.src)
    },
    [caption?.src],
  )
  useEffect(() => {
    if (!session?.id || subtitle < 0) return undefined
    const timer = setInterval(() => setCaptionRetry(value => value + 1), 5000)
    return () => clearInterval(timer)
  }, [session?.id, subtitle])
  useEffect(() => {
    setCaptionError(false)
    if (!session?.id || subtitle < 0 || video.current?.readyState < 3) return undefined
    const controller = new AbortController()
    axios
      .get(session.url.replace('index.m3u8', `subtitle${subtitle}.vtt`), {
        signal: controller.signal,
        timeout: 30000,
        responseType: 'text',
      })
      .then(({ data }) => {
        if (controller.signal.aborted || data === captionText.current) return
        captionText.current = data
        const objectUrl = URL.createObjectURL(new Blob([data], { type: 'text/vtt' }))
        const track = session.subtitles.find(item => item.index === subtitle)
        setCaption({
          src: objectUrl,
          label: track.label,
          language: track.language,
        })
      })
      .catch(error => {
        if (error.code !== 'ERR_CANCELED') setCaptionError(true)
      })
    return () => controller.abort()
  }, [session?.id, session?.offset, session?.subtitles, session?.url, subtitle, captionRetry, video])

  return {
    session,
    seek,
    selectAudio,
    subtitle,
    selectSubtitle: index => {
      if (current.current)
        axios
          .post(`/browser-media/${current.current.id}/control`, { subtitle: index })
          .catch(() => setCaptionError(true))
      setSubtitle(index)
      setCaptionRetry(value => value + 1)
    },
    caption,
    captionError,
  }
}
