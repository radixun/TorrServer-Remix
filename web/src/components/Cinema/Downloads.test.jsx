import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'
import axios from 'axios'

import Downloads from './Downloads'

const mockRows = [
  {
    torrent: { hash: 'a'.repeat(40), title: 'Z current film' },
    status: {
      available: true,
      state: 'downloading',
      files: [{ id: 1, path: 'Current.mkv', state: 'downloading', length: 1000, downloaded_bytes: 20 }],
    },
  },
  {
    torrent: { hash: 'b'.repeat(40), title: 'Queued film' },
    status: { available: true, state: 'queued', pending_file_ids: [7] },
  },
  {
    torrent: { hash: 'c'.repeat(40), title: 'Queued series' },
    status: { available: true, state: 'queued', pending_all: true },
  },
]
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ i18n: { language: 'en' } }),
}))
jest.mock('react-query', () => ({
  useQuery: () => ({ data: mockRows }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}))
jest.mock('axios')

it('shows pending file and whole-torrent jobs beside the current download, with correct cancellation scope', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  axios.post.mockResolvedValue({ data: {} })
  act(() => {
    ReactDOM.render(<Downloads torrents={mockRows.map(row => row.torrent)} onOpen={() => {}} />, root)
  })
  const rows = root.querySelectorAll('.cinema-episode')
  expect(rows).toHaveLength(3)
  expect(rows[0].textContent).toContain('Z current film')
  expect(rows[1].textContent).toContain('Queued film')
  expect(rows[1].textContent).toContain('Queued')
  expect(rows[2].textContent).toContain('Queued series')
  await act(async () => rows[1].querySelectorAll('button')[1].click())
  expect(axios.post.mock.calls[0][1]).toEqual({
    action: 'cancel_file',
    hash: 'b'.repeat(40),
    title: 'Queued film',
    file_id: 7,
  })
  await act(async () => rows[2].querySelectorAll('button')[1].click())
  expect(axios.post.mock.calls[1][1]).toEqual({ action: 'cancel', hash: 'c'.repeat(40), title: 'Queued series' })
  act(() => {
    ReactDOM.unmountComponentAtNode(root)
  })
  root.remove()
})
