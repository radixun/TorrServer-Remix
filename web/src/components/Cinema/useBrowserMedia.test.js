import { needsBrowserMedia } from './useBrowserMedia'

it('adapts library MKV/AVI links but leaves ordinary MP4 playback direct', () => {
  expect(needsBrowserMedia('/offline/stream/hash/1/Movie.mkv')).toBe(true)
  expect(needsBrowserMedia('/stream/Show.avi?link=hash&index=1&play')).toBe(true)
  expect(needsBrowserMedia('/stream/Movie.mp4?link=hash&index=1&play')).toBe(false)
})
