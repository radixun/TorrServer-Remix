import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import { QueryClient, QueryClientProvider, setLogger } from 'react-query'
import axios from 'axios'

import TitlePage from './TitlePage'

jest.mock('axios')
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ i18n: { language: 'ru' } }),
}))
jest.mock('react-query', () => {
  const actual = jest.requireActual('react-query')
  return {
    ...actual,
    useQuery: (key, fn, options) => (key[0] === 'cinema-viewed' ? actual.useQuery(key, fn, options) : {}),
  }
})
jest.mock('./useOffline', () => ({
  ...jest.requireActual('./useOffline'),
  __esModule: true,
  default: () => ({
    data: {
      available: true,
      files: [{ id: 13, state: 'completed', completed: true }],
    },
  }),
}))
jest.mock('components/DialogTorrentDetailsContent', () => () => null)
jest.mock('components/Add/AddDialog', () => () => null)
jest.mock('components/VideoPlayer', () => ({ videoSrc, onPlaybackStarted, onClosed }) => (
  <button
    type='button'
    className='test-player'
    data-source={videoSrc}
    onClick={() => {
      onPlaybackStarted?.()
      onClosed?.()
    }}
  >
    Start video
  </button>
))

const hash = 'a'.repeat(40)
const otherHash = 'b'.repeat(40)
const series = {
  hash,
  title: 'Series',
  category: 'tv',
  file_stats: [
    { id: 1, path: 'Series.S01E01.mp4', length: 1000 },
    { id: 13, path: 'Series.S01E02.mp4', length: 1000 },
    { id: 18, path: 'Series.S01E03.mp4', length: 1000 },
  ],
}
let root
let client
let history
let failRead
let failWrite
const render = async (torrent = series, versions = [torrent]) => {
  await act(async () => {
    ReactDOM.render(
      <QueryClientProvider client={client}>
        <TitlePage group={{ torrent, versions }} initialHash={torrent.hash} onBack={() => {}} />
      </QueryClientProvider>,
      root,
    )
  })
}
const click = async element => {
  await act(async () => element.click())
}
const marks = () => [...root.querySelectorAll('.cinema-episode .cinema-viewed')]
beforeEach(() => {
  setLogger({ log: () => {}, warn: () => {}, error: () => {} })
  client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, cacheTime: Infinity } },
  })
  root = document.createElement('div')
  document.body.appendChild(root)
  history = new Map([
    [hash, new Set([13])],
    [otherHash, new Set()],
  ])
  failRead = false
  failWrite = false
  axios.post.mockReset()
  axios.post.mockImplementation(async (url, request) => {
    expect(url).toContain('/viewed')
    const saved = history.get(request.hash) || new Set()
    if (request.action === 'list') {
      if (failRead) throw new Error('History unavailable')
      return {
        data: [...saved].map(id => ({
          hash: request.hash,
          file_index: id,
        })),
      }
    }
    if (failWrite) throw new Error('Write unavailable')
    if (request.action === 'set') saved.add(request.file_index)
    else saved.delete(request.file_index)
    history.set(request.hash, saved)
    return { data: '' }
  })
})
afterEach(() => {
  act(() => {
    ReactDOM.unmountComponentAtNode(root)
  })
  root.remove()
  client.clear()
  setLogger(console)
})

it('restores old per-file history with non-contiguous IDs and leaves other episodes unmarked', async () => {
  await render()
  expect(marks().map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
  expect(marks()[1].textContent).toBe('Просмотрено')
  expect(marks()[0].textContent).toBe('Не просмотрено')
})

it('sets and removes a single episode on the server and keeps it after reopening with an empty cache', async () => {
  await render()
  await click(marks()[0])
  expect([...history.get(hash)]).toEqual([13, 1])
  await click(marks()[1])
  expect([...history.get(hash)]).toEqual([1])
  act(() => {
    ReactDOM.unmountComponentAtNode(root)
  })
  client.clear()
  await render()
  expect(marks().map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
})

it('shows the watched mark for a movie even without a local resume position', async () => {
  await render({
    ...series,
    category: 'movie',
    file_stats: [series.file_stats[1]],
  })
  expect(root.querySelector('.cinema-hero .cinema-viewed').textContent).toBe('Просмотрено')
  expect(root.querySelector('.cinema-episodes')).toBeNull()
})

it('keeps identical file IDs in different torrent versions separate', async () => {
  const other = { ...series, hash: otherHash, title: 'Other version' }
  await render(series, [series, other])
  const switchVersion = [...root.querySelectorAll('.cinema-filter button')].find(button =>
    button.textContent.startsWith('Other version'),
  )
  await click(switchVersion)
  expect(marks().map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])
  await click(marks()[1])
  expect([...history.get(otherHash)]).toEqual([13])
  expect([...history.get(hash)]).toEqual([13])
})

it('records offline video playback and refreshes server history when the player closes', async () => {
  history.get(hash).clear()
  await render()
  const player = root.querySelectorAll('.cinema-episode .test-player')[1]
  expect(player.dataset.source).toContain(`/offline/stream/${hash}/13/`)
  await click(player)
  expect(history.get(hash).has(13)).toBe(true)
  expect(marks()[1].textContent).toBe('Просмотрено')
})

it('does not show a successful mark for a failed write and retries the same file', async () => {
  await render()
  failWrite = true
  await click(marks()[0])
  expect(marks()[0].getAttribute('aria-pressed')).toBe('false')
  expect(root.querySelector('[role=alert]').textContent).toContain('Не удалось сохранить')
  failWrite = false
  await click(root.querySelector('[role=alert] button'))
  expect(marks()[0].getAttribute('aria-pressed')).toBe('true')
  expect(root.querySelector('[role=alert]')).toBeNull()
})

it('queues a playback mark behind a pending write instead of losing either episode', async () => {
  await render()
  let release
  const respond = axios.post.getMockImplementation()
  axios.post.mockImplementation(async (url, request, options) => {
    if (request.action === 'set' && request.file_index === 1) {
      await new Promise(resolve => {
        release = resolve
      })
    }
    return respond(url, request, options)
  })
  await click(marks()[0])
  await click(root.querySelectorAll('.cinema-episode .test-player')[2])
  await act(async () => release())
  expect(history.get(hash).has(1)).toBe(true)
  expect(history.get(hash).has(18)).toBe(true)
  expect(marks()[2].getAttribute('aria-pressed')).toBe('true')
})

it('reports unavailable history and recovers on retry without inventing unwatched records', async () => {
  failRead = true
  await render()
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
  })
  expect(root.querySelector('[role=alert]').textContent).toContain('Не удалось загрузить')
  expect(marks().every(button => button.disabled)).toBe(true)
  failRead = false
  await click(root.querySelector('[role=alert] button'))
  expect(marks()[1].getAttribute('aria-pressed')).toBe('true')
  expect(root.querySelector('[role=alert]')).toBeNull()
})
