import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog } from '@material-ui/core'
import PlayArrowIcon from '@material-ui/icons/PlayArrow'
import PauseIcon from '@material-ui/icons/Pause'
import Replay10Icon from '@material-ui/icons/Replay10'
import Forward10Icon from '@material-ui/icons/Forward10'
import FullscreenIcon from '@material-ui/icons/Fullscreen'
import PictureInPictureAltIcon from '@material-ui/icons/PictureInPictureAlt'
import ArrowBackIcon from '@material-ui/icons/ArrowBack'
import { getVlcLink } from 'utils/playerLinks'

import useCinemaText from './Cinema/text'
import { readLocalProgress } from './Cinema/media'
import useBrowserMedia, { needsBrowserMedia } from './Cinema/useBrowserMedia'
import TrackPanel, { bindTrackPreferences } from './Cinema/TrackPanel'
import './Cinema/player.css'

const time = value => {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const seconds = Math.floor(value)
  return `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}:` : ''}${String(
    Math.floor(seconds / 60) % 60,
  ).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export default function VideoPlayer({
  videoSrc,
  captionSrc = '',
  title,
  buttonLabel,
  buttonClassName = 'cinema-button',
  mediaId,
  onClosed,
  onPlaybackStarted,
}) {
  const c = useCinemaText()
  const video = useRef(null)
  const shell = useRef(null)
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [needsPlay, setNeedsPlay] = useState(false)
  const [error, setError] = useState('')
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [controls, setControls] = useState(true)
  const [caption, setCaption] = useState('')
  const controlsTimer = useRef(null)
  const lastSave = useRef(0)
  const playbackStarted = useRef(false)
  const audioButton = useRef(null)
  const subtitleButton = useRef(null)
  const unbindTracks = useRef(null)
  const key = mediaId || videoSrc
  const [retry, setRetry] = useState(0)
  const [forceAdapt, setForceAdapt] = useState(false)
  const adapted = needsBrowserMedia(videoSrc) || forceAdapt
  const browser = useBrowserMedia({
    enabled: open && adapted,
    source: videoSrc,
    mediaId: key,
    video,
    position,
    onError: setError,
    retry,
  })
  const offset = browser.session?.offset || 0
  const seekTimer = useRef(null)
  useEffect(() => {
    if (browser.session) {
      setDuration(browser.session.duration)
      setWaiting(true)
    }
  }, [browser.session])

  useEffect(() => {
    setCaption('')
    if (!open || !captionSrc) return undefined
    const controller = new AbortController()
    let objectUrl
    fetch(captionSrc, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Caption unavailable')
        return response.text()
      })
      .then(content => {
        if (controller.signal.aborted) return
        const source = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
        const vtt = source.startsWith('WEBVTT')
          ? source
          : `WEBVTT\n\n${source.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
        objectUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
        setCaption(objectUrl)
      })
      .catch(() => {
        /* The track panel reports unavailable captions; playback remains usable. */
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, captionSrc])

  const save = useCallback(() => {
    const element = video.current
    const length = browser.session?.duration || element?.duration
    if (!element || !Number.isFinite(length) || length <= 0 || element.readyState < 1) return
    const absolute = offset + element.currentTime
    const ended = element.ended || length - absolute < 30
    try {
      localStorage.setItem(
        `cinema.progress.${key}`,
        JSON.stringify({
          position: ended ? 0 : absolute,
          duration: length,
          updatedAt: Date.now(),
        }),
      )
    } catch (_) {
      /* Playback remains usable when browser storage is unavailable. */
    }
  }, [key, browser.session?.duration, offset])

  const close = useCallback(() => {
    save()
    clearTimeout(seekTimer.current)
    video.current?.pause()
    setOpen(false)
    setPanel(null)
    unbindTracks.current?.()
    onClosed?.()
  }, [save, onClosed])

  const reveal = () => {
    setControls(true)
    clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => {
      if (!shell.current?.contains(document.activeElement) || document.activeElement === video.current)
        setControls(false)
    }, 3500)
  }

  useEffect(() => {
    if (!open) return undefined
    const onHide = () => {
      if (document.hidden) save()
    }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onHide)
      clearTimeout(controlsTimer.current)
    }
  }, [open, save])

  useEffect(() => {
    if (!open || !waiting || error || needsPlay) return undefined
    const timeout = setTimeout(() => {
      if (!adapted && /^[a-f0-9]{40}:\d+$/i.test(mediaId || '')) setForceAdapt(true)
      else setError(c.playbackError)
    }, 30000)
    return () => clearTimeout(timeout)
  }, [open, waiting, error, needsPlay, c.playbackError, adapted, mediaId])

  const toggle = () => {
    if (!video.current) return
    if (video.current.paused) video.current.play().catch(() => setError(c.playbackError))
    else video.current.pause()
    reveal()
  }
  const seekTo = absolute => {
    if (!video.current || !duration) return
    const value = Math.max(0, Math.min(duration - 1, absolute))
    if (adapted) browser.seek(value)
    else video.current.currentTime = value
    setPosition(value)
    reveal()
  }
  const seek = delta => seekTo(offset + (video.current?.currentTime || 0) + delta)
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (shell.current?.requestFullscreen) await shell.current.requestFullscreen()
      else video.current?.webkitEnterFullscreen?.()
    } catch (_) {
      reveal()
    }
  }
  const launch = () => {
    if (window.AndroidTorrServer?.play) {
      window.AndroidTorrServer.play(new URL(videoSrc, window.location.href).toString(), title || '')
      return
    }
    playbackStarted.current = false
    setWaiting(true)
    setNeedsPlay(false)
    setForceAdapt(false)
    setSpeed(1)
    setVolume(1)
    setError('')
    setPosition(0)
    setDuration(0)
    setOpen(true)
    setControls(true)
  }
  const closePanel = () => {
    const previous = panel
    setPanel(null)
    requestAnimationFrame(() => (previous === 'audio' ? audioButton.current : subtitleButton.current)?.focus())
  }

  return (
    <>
      <button type='button' className={buttonClassName} onClick={launch}>
        <PlayArrowIcon />
        <span>{buttonLabel || c.watch}</span>
      </button>
      <Dialog
        fullScreen
        open={open}
        onClose={panel ? closePanel : close}
        aria-labelledby='cinema-player-title'
        TransitionProps={{
          onEntered: () => {
            video.current?.focus()
            reveal()
            unbindTracks.current = bindTrackPreferences(video.current)
          },
        }}
      >
        <div
          className={`cinema-player${controls || !playing || waiting || panel || error ? ' show-controls' : ''}`}
          ref={shell}
          role='presentation'
          onMouseMove={reveal}
          onTouchStart={reveal}
          onFocus={reveal}
          onKeyDown={event => {
            if (event.target.closest('button, input, select, a')) return
            if (event.key === ' ') {
              event.preventDefault()
              toggle()
            }
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              seek(-10)
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              seek(10)
            }
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Native/sidecar tracks depend on the selected media. */}
          <video
            ref={video}
            className='cinema-video'
            src={adapted ? undefined : videoSrc}
            autoPlay
            playsInline
            tabIndex={0}
            onClick={toggle}
            onWaiting={() => setWaiting(true)}
            onStalled={() => {
              if (video.current.readyState < 3) setWaiting(true)
            }}
            onPlaying={() => {
              setWaiting(false)
              setNeedsPlay(false)
              setPlaying(true)
              setError('')
              if (!playbackStarted.current) {
                playbackStarted.current = true
                onPlaybackStarted?.()
              }
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false)
              save()
            }}
            onError={() => {
              if (!adapted && /^[a-f0-9]{40}:\d+$/i.test(mediaId || '')) {
                setForceAdapt(true)
                setWaiting(true)
              } else {
                setWaiting(false)
                setError(c.playbackError)
              }
            }}
            onEnded={() => {
              setPlaying(false)
              save()
            }}
            onLoadedMetadata={() => {
              const element = video.current
              if (adapted) {
                element.currentTime = 0
              } else {
                const length = Number.isFinite(element.duration) ? element.duration : 0
                setDuration(length)
                const saved = readLocalProgress(key)
                if (saved?.position > 5 && saved.position < length - 30) element.currentTime = saved.position
              }
              element.play().catch(failure => {
                if (failure.name === 'NotAllowedError') {
                  setWaiting(false)
                  setNeedsPlay(true)
                } else if (failure.name !== 'AbortError') setError(c.playbackError)
              })
            }}
            onCanPlay={() => setWaiting(false)}
            onTimeUpdate={() => {
              if (video.current.readyState >= 3) setWaiting(false)
              if (!seekTimer.current) setPosition(offset + video.current.currentTime)
              if (Date.now() - lastSave.current > 5000) {
                save()
                lastSave.current = Date.now()
              }
            }}
          >
            {caption && !adapted && <track src={caption} kind='subtitles' label={c.subtitles} srcLang='und' />}
            {browser.caption && (
              <track
                key={browser.caption.src}
                src={browser.caption.src}
                kind='subtitles'
                label={browser.caption.label}
                srcLang={browser.caption.language}
                default
                ref={element => {
                  const track = element?.track
                  if (track) track.mode = 'showing'
                }}
              />
            )}
          </video>
          {needsPlay && !error && (
            <button type='button' className='cinema-start-playback' onClick={toggle}>
              <PlayArrowIcon />
              {c.play}
            </button>
          )}
          {waiting && !error && (
            <p className='cinema-player-message' role='status'>
              {c.buffering}
            </p>
          )}
          {error && (
            <div className='cinema-player-message' role='alert'>
              <p>{error}</p>
              <button
                type='button'
                onClick={() => {
                  save()
                  if (adapted) setRetry(value => value + 1)
                  else video.current.load()
                  setWaiting(true)
                  setError('')
                }}
              >
                {c.retry}
              </button>
              <a href={getVlcLink(new URL(videoSrc, window.location.href))}>{c.openExternal}</a>
            </div>
          )}
          <div className='cinema-player-top cinema-player-controls'>
            <button type='button' className='cinema-icon-button' aria-label={c.back} title={c.back} onClick={close}>
              <ArrowBackIcon />
            </button>
            <span id='cinema-player-title'>{title}</span>
            <button type='button' ref={audioButton} onClick={() => setPanel('audio')}>
              {c.audio}
            </button>
            <button type='button' ref={subtitleButton} onClick={() => setPanel('subtitles')}>
              {c.subtitles}
            </button>
          </div>
          <div className='cinema-player-bottom cinema-player-controls'>
            <input
              type='range'
              aria-label={c.seek}
              min='0'
              max={duration || 1}
              step='1'
              value={position}
              onChange={event => {
                const value = Number(event.target.value)
                setPosition(value)
                clearTimeout(seekTimer.current)
                seekTimer.current = setTimeout(() => {
                  seekTimer.current = null
                  seekTo(value)
                }, 250)
              }}
            />
            <div className='cinema-player-buttons'>
              <button
                type='button'
                className='cinema-icon-button'
                aria-label={playing ? c.pause : c.play}
                title={playing ? c.pause : c.play}
                onClick={toggle}
              >
                {playing ? <PauseIcon /> : <PlayArrowIcon />}
              </button>
              <button
                type='button'
                className='cinema-icon-button'
                aria-label={c.rewind}
                title={c.rewind}
                onClick={() => seek(-10)}
              >
                <Replay10Icon />
              </button>
              <button
                type='button'
                className='cinema-icon-button'
                aria-label={c.forward}
                title={c.forward}
                onClick={() => seek(10)}
              >
                <Forward10Icon />
              </button>
              <span>
                {time(position)} / {time(duration)}
              </span>
              <input
                type='range'
                aria-label={c.volume}
                min='0'
                max='1'
                step='.05'
                value={volume}
                onChange={event => {
                  const value = Number(event.target.value)
                  setVolume(value)
                  video.current.volume = value
                }}
              />
              <select
                aria-label={c.speed}
                value={speed}
                onChange={event => {
                  const value = Number(event.target.value)
                  setSpeed(value)
                  video.current.playbackRate = value
                }}
              >
                {[0.5, 1, 1.5, 2].map(value => (
                  <option value={value} key={value}>
                    {value}×
                  </option>
                ))}
              </select>
              {document.pictureInPictureEnabled && (
                <button
                  type='button'
                  className='cinema-icon-button'
                  aria-label='Picture in picture'
                  title='Picture in picture'
                  onClick={() => video.current.requestPictureInPicture?.().catch(() => {})}
                >
                  <PictureInPictureAltIcon />
                </button>
              )}
              <button
                type='button'
                className='cinema-icon-button'
                aria-label={c.fullscreen}
                title={c.fullscreen}
                onClick={fullscreen}
              >
                <FullscreenIcon />
              </button>
            </div>
          </div>
          {panel && (
            <TrackPanel
              kind={panel}
              video={video.current}
              onClose={closePanel}
              choices={
                adapted
                  ? panel === 'audio'
                    ? browser.session?.audios || []
                    : browser.session?.subtitles || []
                  : undefined
              }
              chosen={panel === 'audio' ? browser.session?.audio : browser.subtitle}
              onChoose={panel === 'audio' ? browser.selectAudio : browser.selectSubtitle}
              error={panel === 'subtitles' && browser.captionError ? c.captionError : ''}
            />
          )}
        </div>
      </Dialog>
    </>
  )
}
