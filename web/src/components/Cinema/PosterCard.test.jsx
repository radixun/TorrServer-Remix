import { useState } from 'react'
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'

import PosterCard from './PosterCard'

let root
const open = jest.fn()
const group = { key: 'film', torrent: { hash: 'abc', title: 'Film', poster: '/poster.jpg' } }
function Library() {
  const [selected, select] = useState(null)
  return <PosterCard group={group} selected={selected === group.key} onSelect={select} onOpen={open} />
}
const fire = (type, properties = {}) => {
  const event = new MouseEvent(type, { bubbles: true, detail: 1, ...properties })
  Object.defineProperty(event, 'pointerType', { value: properties.pointerType || 'touch' })
  act(() => {
    root.querySelector('button').dispatchEvent(event)
  })
}
beforeEach(() => {
  open.mockClear()
  root = document.createElement('div')
  document.body.appendChild(root)
  act(() => {
    ReactDOM.render(<Library />, root)
  })
})
afterEach(() => {
  act(() => {
    ReactDOM.unmountComponentAtNode(root)
  })
  root.remove()
})
it('reveals on first touch and opens on a separate second touch', () => {
  fire('pointerdown')
  fire('click')
  expect(open).not.toHaveBeenCalled()
  expect(root.querySelector('button').className).toContain('is-selected')
  fire('pointerdown')
  fire('click')
  expect(open).toHaveBeenCalledWith('abc')
})
it('does not select or open when the gesture is a scroll', () => {
  fire('pointerdown', { clientY: 100 })
  fire('pointermove', { clientY: 160 })
  fire('pointercancel')
  fire('click')
  expect(open).not.toHaveBeenCalled()
  expect(root.querySelector('button').className).not.toContain('is-selected')
})
it('opens with keyboard or remote activation after focus', () => {
  act(() => root.querySelector('button').focus())
  expect(root.querySelector('button').className).toContain('is-selected')
  fire('click', { detail: 0 })
  expect(open).toHaveBeenCalledTimes(1)
})
