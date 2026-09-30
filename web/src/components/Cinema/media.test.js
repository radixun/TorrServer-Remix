import { groupLibrary, mediaFiles, playbackSource, readLocalProgress, torrentData } from './media'

const hash = 'a'.repeat(40)
const file = { id: 2, path: 'Season/Movie 2.mkv', length: 100 }
const torrent = { hash, title: 'Film' }

it('uses disk only when storage and the selected complete file are verified', () => {
  const ready = { available: true, files: [{ ...file, state: 'completed', completed: true }] }
  expect(playbackSource(torrent, file, ready).fromDisk).toBe(true)
  expect(playbackSource(torrent, file, ready).url).toContain(`/offline/stream/${hash}/2/Movie%202.mkv`)
  for (const status of [
    undefined,
    { ...ready, available: false },
    { ...ready, files: [{ ...file, state: 'downloading' }] },
    { ...ready, files: [{ id: 1, state: 'completed', completed: true }] },
  ]) {
    expect(playbackSource(torrent, file, status)).toMatchObject({ fromDisk: false, id: `${hash}:2` })
    expect(playbackSource(torrent, file, status).url).toContain(`index=2&play`)
  }
})

it('recovers saved episode metadata while idle and ignores malformed data and non-media files', () => {
  expect(torrentData({ data: '{broken' })).toEqual({})
  const data = JSON.stringify({
    TorrServer: {
      Files: [
        { ...file, id: 3, path: 'Show.S01E03.mkv' },
        { ...file, path: 'Show.S01E02.mkv' },
        { id: 4, path: 'info.txt' },
      ],
    },
  })
  expect(mediaFiles({ data }).map(value => [value.id, value.episode])).toEqual([
    [2, 2],
    [3, 3],
  ])
})

it('does not merge same-name releases without an explicit shared identity', () => {
  const second = { ...torrent, hash: 'b'.repeat(40) }
  expect(groupLibrary([torrent, second])).toHaveLength(2)
  const data = { TorrServer: { Metadata: { tmdb: { id: 12, media_type: 'tv' } } } }
  expect(
    groupLibrary([
      { ...torrent, data },
      { ...second, data },
    ])[0].versions,
  ).toHaveLength(2)
})

it('reads device progress through the native bridge and rejects invalid progress', () => {
  localStorage.setItem(`cinema.progress.${hash}:2`, JSON.stringify({ position: 42 }))
  expect(readLocalProgress(`${hash}:2`).position).toBe(42)
  window.AndroidTorrServer = { progress: () => JSON.stringify({ position: 81 }) }
  expect(readLocalProgress(`${hash}:2`).position).toBe(81)
  window.AndroidTorrServer.progress = () => '{broken'
  expect(readLocalProgress(`${hash}:2`)).toBeNull()
  delete window.AndroidTorrServer
  localStorage.clear()
})
