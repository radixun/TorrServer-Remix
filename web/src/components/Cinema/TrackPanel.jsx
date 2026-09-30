/* eslint-disable no-param-reassign -- TextTrack and VTTCue browser objects are edited in place. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import useCinemaText from './text'

const defaults = { font: 'sans-serif', size: 100, position: 92 }
const trackKeys = new WeakMap()
let nextTrackKey = 0
const trackKey = track => {
  if (!trackKeys.has(track)) trackKeys.set(track, ++nextTrackKey)
  return trackKeys.get(track)
}
const readStyle = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('cinema.subtitle-style') || '{}')
    return {
      font: ['sans-serif', 'serif', 'monospace'].includes(saved.font) ? saved.font : defaults.font,
      size: [80, 100, 125, 150].includes(saved.size) ? saved.size : defaults.size,
      position: [92, 82, 60].includes(saved.position) ? saved.position : defaults.position,
    }
  } catch (_) {
    return defaults
  }
}

export const subtitleLayout = (frame, source, position, controlsTop) => {
  const scale = Math.min(frame.width / source.width, frame.height / source.height)
  const width = source.width * scale
  const height = source.height * scale
  const top = (frame.height - height) / 2
  const preferred = top + (height * position) / 100
  const bottom = Number.isFinite(controlsTop) ? Math.min(preferred, controlsTop - 20) : preferred
  return { width, height, line: Math.max(10, Math.min(position, ((bottom - top) / height) * 100)) }
}

export const applySubtitleStyle = (video, style = readStyle()) => {
  if (!video) return
  video.dataset.subtitleFont = style.font
  video.dataset.subtitleSize = String(style.size)
  const player = video.closest('.cinema-player')
  const frame = player?.getBoundingClientRect()
  let line = style.position
  if (frame?.width && frame.height && video.videoWidth && video.videoHeight) {
    const controls = player.classList.contains('show-controls') && player.querySelector('.cinema-player-bottom')
    const layout = subtitleLayout(
      frame,
      { width: video.videoWidth, height: video.videoHeight },
      style.position,
      controls ? controls.getBoundingClientRect().top - frame.top : undefined,
    )
    // Native WebVTT coordinates now refer to the picture, not portrait letterboxing.
    video.style.width = `${layout.width}px`
    video.style.height = `${layout.height}px`
    line = layout.line
  }
  Array.from(video.textTracks || []).forEach(track => {
    try {
      Array.from(track.activeCues || track.cues || []).forEach(cue => {
        cue.snapToLines = false
        if ('lineAlign' in cue) {
          cue.lineAlign = 'end'
          cue.line = line
        } else {
          // Older native players anchor at the first line; reserve space for wrapping.
          cue.line = Math.max(10, line - 12 * (style.size / 100))
        }
      })
    } catch (_) {
      /* Some native tracks do not expose editable cues. */
    }
  })
}

export const bindTrackPreferences = video => {
  const subscribed = new Set()
  const styleCues = () => applySubtitleStyle(video)
  const restore = () => {
    const currentTracks = Array.from(video.textTracks || [])
    subscribed.forEach(track => {
      if (!currentTracks.includes(track)) {
        track.removeEventListener('cuechange', styleCues)
        subscribed.delete(track)
      }
    })
    ;['audio', 'subtitles'].forEach(kind => {
      const list = Array.from((kind === 'audio' ? video.audioTracks : video.textTracks) || [])
      let language
      try {
        language = localStorage.getItem(`cinema.${kind}-language`)
      } catch (_) {
        return
      }
      const match = list.find(track => language && track.language === language)
      list.forEach(track => {
        if (kind === 'audio' && match) track.enabled = track === match
        if (kind === 'subtitles') {
          if (language === 'off' || match) track.mode = track === match ? 'showing' : 'disabled'
          if (!subscribed.has(track)) {
            track.addEventListener('cuechange', styleCues)
            subscribed.add(track)
          }
        }
      })
    })
    styleCues()
  }
  restore()
  video.addEventListener('loadedmetadata', restore)
  video.addEventListener('resize', styleCues)
  const player = video.closest('.cinema-player')
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(styleCues) : null
  const controls = new MutationObserver(styleCues)
  if (player) {
    resize?.observe(player)
    controls.observe(player, { attributes: true, attributeFilter: ['class'] })
  }
  video.audioTracks?.addEventListener('addtrack', restore)
  video.textTracks?.addEventListener('addtrack', restore)
  video.textTracks?.addEventListener('removetrack', restore)
  return () => {
    video.removeEventListener('loadedmetadata', restore)
    video.removeEventListener('resize', styleCues)
    resize?.disconnect()
    controls.disconnect()
    video.audioTracks?.removeEventListener('addtrack', restore)
    video.textTracks?.removeEventListener('addtrack', restore)
    video.textTracks?.removeEventListener('removetrack', restore)
    subscribed.forEach(track => track.removeEventListener('cuechange', styleCues))
  }
}

export default function TrackPanel({ kind, video, onClose, choices, chosen, onChoose, error }) {
  const c = useCinemaText()
  const { i18n } = useTranslation()
  const root = useRef(null)
  const [tracks, setTracks] = useState([])
  const [selection, setSelection] = useState(-1)
  const [style, setStyle] = useState(readStyle)
  const label = (track, index) => {
    let { language } = track
    try {
      const aliases = { rus: 'ru', eng: 'en', jpn: 'ja', ukr: 'uk', kaz: 'kk', fra: 'fr', deu: 'de', spa: 'es' }
      language = new Intl.DisplayNames([i18n.language], { type: 'language' }).of(aliases[language] || language)
    } catch (_) {
      /* Older engines retain the stream's language code. */
    }
    const title = track.label || ''
    if (language && language !== 'und' && !title.toLowerCase().startsWith(language.toLowerCase()))
      return title ? `${language} · ${title}` : language
    return title || language || `${c.track} ${index + 1}`
  }

  useEffect(() => {
    if (choices) {
      setTracks(choices)
      setSelection(choices.findIndex(track => track.index === chosen))
      return undefined
    }
    const list = kind === 'audio' ? video?.audioTracks : video?.textTracks
    const update = () => {
      const values = Array.from(list || [])
      setTracks(values)
      setSelection(values.findIndex(track => (kind === 'audio' ? track.enabled : track.mode === 'showing')))
    }
    update()
    list?.addEventListener('addtrack', update)
    list?.addEventListener('removetrack', update)
    list?.addEventListener('change', update)
    return () => {
      list?.removeEventListener('addtrack', update)
      list?.removeEventListener('removetrack', update)
      list?.removeEventListener('change', update)
    }
  }, [video, kind, choices, chosen])

  useEffect(() => {
    const target =
      root.current?.querySelector('[aria-checked="true"]') || root.current?.querySelector('[data-track], button')
    target?.focus()
  }, [kind, tracks.length])

  const choose = index => {
    if (choices) onChoose(index < 0 ? -1 : tracks[index].index)
    else
      tracks.forEach((track, current) => {
        if (kind === 'audio') track.enabled = index === current
        else track.mode = index === current ? 'showing' : 'disabled'
      })
    setSelection(index)
    applySubtitleStyle(video, style)
    try {
      localStorage.setItem(`cinema.${kind}-language`, index < 0 ? 'off' : tracks[index]?.language || '')
    } catch (_) {
      /* Preferences are optional in private browsing. */
    }
  }
  const change = (field, value) => {
    const next = { ...style, [field]: value }
    setStyle(next)
    applySubtitleStyle(video, next)
    try {
      localStorage.setItem('cinema.subtitle-style', JSON.stringify(next))
    } catch (_) {
      /* Keep the live setting. */
    }
  }
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The dialog handles Escape and radio keyboard navigation.
    <section
      className='cinema-track-panel'
      ref={root}
      role='dialog'
      tabIndex={-1}
      aria-label={kind === 'audio' ? c.audio : c.subtitles}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
        if (
          event.target.matches('[data-track]') &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
        ) {
          event.preventDefault()
          const radios = Array.from(root.current.querySelectorAll('[data-track]:not(:disabled)'))
          const index = radios.indexOf(event.target)
          const delta = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1
          const next = radios[(index + delta + radios.length) % radios.length]
          next.focus()
          next.click()
        }
      }}
    >
      <div className='cinema-track-heading'>
        <h2>{kind === 'audio' ? c.audio : c.subtitles}</h2>
        <button type='button' onClick={onClose}>
          {c.close}
        </button>
      </div>
      {kind === 'subtitles' && (
        <div className='cinema-caption-settings'>
          <label htmlFor='cinema-caption-font'>
            {c.font}
            <select id='cinema-caption-font' value={style.font} onChange={event => change('font', event.target.value)}>
              <option value='sans-serif'>{c.sans}</option>
              <option value='serif'>{c.serif}</option>
              <option value='monospace'>{c.mono}</option>
            </select>
          </label>
          <label htmlFor='cinema-caption-size'>
            {c.size}
            <select
              id='cinema-caption-size'
              value={style.size}
              onChange={event => change('size', Number(event.target.value))}
            >
              {[80, 100, 125, 150].map(value => (
                <option key={value} value={value}>
                  {value}%
                </option>
              ))}
            </select>
          </label>
          <label htmlFor='cinema-caption-position'>
            {c.position}
            <select
              id='cinema-caption-position'
              value={style.position}
              onChange={event => change('position', Number(event.target.value))}
            >
              <option value='92'>{c.bottom}</option>
              <option value='82'>{c.higher}</option>
              <option value='60'>{c.middle}</option>
            </select>
          </label>
        </div>
      )}
      <div role='radiogroup' aria-label={kind === 'audio' ? c.audio : c.subtitles}>
        {kind === 'subtitles' && (
          <button type='button' role='radio' data-track aria-checked={selection < 0} onClick={() => choose(-1)}>
            {c.off}
          </button>
        )}
        {tracks.map((track, index) => (
          <button
            type='button'
            key={trackKey(track)}
            role='radio'
            data-track
            aria-checked={selection === index}
            disabled={track.supported === false}
            onClick={() => choose(index)}
          >
            {label(track, index)}
            {track.supported === false && <small> · {c.bitmapSubtitle}</small>}
          </button>
        ))}
      </div>
      {error && <p role='alert'>{error}</p>}
      {!tracks.length && <p>{kind === 'audio' ? c.noAudio : c.noSubtitles}</p>}
    </section>
  )
}
