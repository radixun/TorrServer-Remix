import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'

import VideoPlayer from './VideoPlayer'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en' } }),
}))
jest.mock('@material-ui/core', () => ({
  Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
}))
jest.mock('./Cinema/useBrowserMedia', () => ({
  __esModule: true,
  default: () => ({}),
  needsBrowserMedia: () => false,
}))
jest.mock('./Cinema/TrackPanel', () => ({
  __esModule: true,
  default: () => null,
  bindTrackPreferences: () => {},
}))

let root
const started = jest.fn()
beforeEach(() => {
  started.mockClear()
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  root = document.createElement('div')
  document.body.appendChild(root)
  act(() => {
    ReactDOM.render(<VideoPlayer videoSrc='/movie.mp4' onPlaybackStarted={started} />, root)
  })
})
afterEach(() => {
  act(() => {
    ReactDOM.unmountComponentAtNode(root)
  })
  root.remove()
  jest.restoreAllMocks()
})

const fire = event => {
  act(() => {
    root.querySelector('video').dispatchEvent(new Event(event))
  })
}

it('does not record a click, buffering or failed video as successful playback', () => {
  act(() => root.querySelector('button').click())
  fire('waiting')
  fire('error')
  expect(started).not.toHaveBeenCalled()
})

it('records actual playing once per launch despite pause, buffering and resumed playing events', () => {
  act(() => root.querySelector('button').click())
  fire('playing')
  fire('pause')
  fire('waiting')
  fire('playing')
  expect(started).toHaveBeenCalledTimes(1)
  act(() => root.querySelector('[aria-label=Back]').click())
  act(() => root.querySelector('button').click())
  fire('playing')
  expect(started).toHaveBeenCalledTimes(2)
})
