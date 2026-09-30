import { subtitleLayout } from './TrackPanel'

const source = { width: 1920, height: 1038 }
test('portrait captions remain on the picture above the distant controls', () => {
  const layout = subtitleLayout({ width: 960, height: 1280 }, source, 92, 1120)
  expect(layout.width).toBe(960)
  expect(layout.height).toBe(519)
  expect(layout.line).toBeCloseTo(92)
  expect((1280 - layout.height) / 2 + (layout.height * layout.line) / 100).toBeLessThan(900)
})

test('landscape captions move above visible controls and restore the chosen position when hidden', () => {
  const frame = { width: 1440, height: 900 }
  const shown = subtitleLayout(frame, source, 92, 754)
  expect((900 - shown.height) / 2 + (shown.height * shown.line) / 100).toBeCloseTo(734)
  expect(subtitleLayout(frame, source, 92).line).toBeCloseTo(92)
  expect(subtitleLayout(frame, source, 60, 754).line).toBeCloseTo(60)
})
