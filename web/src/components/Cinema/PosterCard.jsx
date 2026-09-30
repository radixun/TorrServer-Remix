import { memo, useRef } from 'react'

import { mediaTitle } from './media'
import usePoster from './usePoster'

function PosterCard({ group, selected, onSelect, onOpen }) {
  const { torrent } = group
  const title = mediaTitle(torrent)
  const poster = usePoster(torrent)
  const pointer = useRef(null)
  const hasPoster = !!poster.src

  return (
    <button
      type='button'
      className={`cinema-poster${selected ? ' is-selected' : ''}${hasPoster ? '' : ' no-poster'}`}
      data-poster-id={torrent.hash}
      aria-label={title}
      onPointerEnter={event => {
        if (event.pointerType === 'mouse') onSelect(group.key)
      }}
      onPointerLeave={event => {
        if (event.pointerType === 'mouse' && document.activeElement !== event.currentTarget) onSelect(null)
      }}
      onPointerDown={event => {
        pointer.current = { type: event.pointerType, x: event.clientX, y: event.clientY, selected, moved: false }
      }}
      onPointerMove={event => {
        if (pointer.current && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 10)
          pointer.current.moved = true
      }}
      onPointerCancel={() => {
        if (pointer.current) pointer.current.moved = true
      }}
      onFocus={() => {
        if (pointer.current?.type !== 'touch') onSelect(group.key)
      }}
      onBlur={() => onSelect(null)}
      onClick={event => {
        const gesture = pointer.current
        pointer.current = null
        if (gesture?.moved) return
        if (event.detail === 0 || (gesture?.type === 'touch' ? gesture.selected : selected)) onOpen(torrent.hash)
        else onSelect(group.key)
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onSelect(null)
        }
      }}
    >
      {hasPoster && <img src={poster.src} alt='' loading='lazy' draggable='false' onError={poster.onError} />}
      <span className='cinema-poster-title'>{title}</span>
    </button>
  )
}

export default memo(PosterCard)
