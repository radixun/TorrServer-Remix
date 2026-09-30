import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { QueryClient, QueryClientProvider } from 'react-query'
import axios from 'axios'

import TitlePage, { DownloadAction } from './TitlePage'

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ i18n: { language: 'en' } }),
}))
jest.mock('react-query', () => {
  const actual = jest.requireActual('react-query')
  return {
    ...actual,
    useQuery: (key, fn, options) => (key[0] === 'cinema-files' ? actual.useQuery(key, fn, options) : {}),
  }
})
jest.mock('./useOffline', () => ({ ...jest.requireActual('./useOffline'), __esModule: true, default: () => ({}) }))
jest.mock('axios')
jest.mock('components/DialogTorrentDetailsContent', () => () => null)
jest.mock('components/Add/AddDialog', () => ({ poster }) => (
  <div role='dialog' data-cover={poster}>
    Cover editor
  </div>
))
jest.mock('components/VideoPlayer', () => ({ buttonClassName, videoSrc, buttonLabel }) => (
  <button type='button' className={buttonClassName} data-source={videoSrc}>
    {buttonLabel || 'Watch'}
  </button>
))

let root
let client
const torrent = {
  hash: 'a'.repeat(40),
  title: 'Dexter / S01',
  category: 'tv',
  poster: 'https://old.example/cover.jpg',
  data: {
    TorrServer: {
      Files: [
        { id: 1, path: 'Dexter.S01E01.avi' },
        { id: 13, path: 'Dexter.S02E01.avi' },
        { id: 14, path: 'Dexter.S02E02.avi' },
      ],
      Metadata: { tmdb: { poster: 'https://metadata.example/cover.jpg' } },
    },
  },
}
const click = text =>
  act(() => [...root.querySelectorAll('button')].find(button => button.textContent === text).click())
beforeEach(() => {
  jest.useFakeTimers()
  axios.post.mockReset()
  client = new QueryClient()
  root = document.createElement('div')
  document.body.appendChild(root)
  act(() => {
    ReactDOM.render(
      <QueryClientProvider client={client}>
        <TitlePage group={{ torrent, versions: [torrent] }} initialHash={torrent.hash} onBack={() => {}} />
      </QueryClientProvider>,
      root,
    )
  })
})
afterEach(() => {
  act(() => {
    ReactDOM.unmountComponentAtNode(root)
  })
  root.remove()
  client.clear()
  jest.useRealTimers()
})

it('changes the hero label and actual Watch source when selecting another season or episode', () => {
  expect(root.querySelector('.primary').dataset.source).toContain('index=1&play')
  click('Season 2')
  expect(root.querySelector('.cinema-hero').textContent).toContain('Season 2 · Episode 01')
  expect(root.querySelector('.primary').dataset.source).toContain('index=13&play')
  act(() => root.querySelectorAll('.cinema-episode-choice')[1].click())
  expect(root.querySelector('.cinema-hero').textContent).toContain('Season 2 · Episode 02')
  expect(root.querySelector('.primary').dataset.source).toContain('index=14&play')
})

it('uses the existing metadata cover after a failed image and opens its editor from the cover', () => {
  act(() => {
    root.querySelector('.cinema-cover-edit img').dispatchEvent(new Event('error'))
  })
  expect(root.querySelector('.cinema-cover-edit img').src).toBe('https://metadata.example/cover.jpg')
  act(() => root.querySelector('.cinema-cover-edit').click())
  expect(root.querySelector('[role=dialog]').dataset.cover).toBe('https://metadata.example/cover.jpg')
})

it('opens idle torrents without requiring repeated Retry clicks while metadata arrives', async () => {
  const idle = { hash: 'b'.repeat(40), title: 'Another series', category: 'tv' }
  axios.post.mockResolvedValueOnce({ data: idle }).mockResolvedValueOnce({
    data: { ...idle, file_stats: [{ id: 1, path: 'Another.S01E01.mkv', length: 1000 }] },
  })
  await act(async () => {
    ReactDOM.render(
      <QueryClientProvider client={client}>
        <TitlePage group={{ torrent: idle, versions: [idle] }} initialHash={idle.hash} onBack={() => {}} />
      </QueryClientProvider>,
      root,
    )
  })
  expect(root.textContent).toContain('Getting the file list')
  expect(root.textContent).not.toContain('Retry')
  await act(async () => {
    jest.advanceTimersByTime(2000)
  })
  expect(root.querySelector('.primary').dataset.source).toContain(`link=${idle.hash}&index=1`)
  expect(root.textContent).not.toContain('Getting the file list')
  expect(axios.post).toHaveBeenCalledTimes(2)
})

it('shows the accepted queue selection before a file manifest exists', () => {
  const action = jest.fn()
  act(() => {
    ReactDOM.render(
      <DownloadAction
        file={{ id: 1, path: 'Movie.mkv' }}
        status={{ available: true, state: 'queued', pending_file_ids: [1] }}
        action={action}
      />,
      root,
    )
  })
  const button = root.querySelector('button')
  expect(button.textContent).toContain('Queued')
  act(() => button.click())
  expect(action).toHaveBeenCalledWith('cancel_file', 1)
})
