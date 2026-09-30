import { detectVlcPlatform, getVlcLink } from './playerLinks'

const streamUrl = 'http://192.0.2.10:8090/stream/Movie%20Name.mkv?link=hash&index=1&play'

describe('playerLinks', () => {
  it('uses VLC x-callback stream links on iPhone', () => {
    const nav = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }

    expect(getVlcLink(streamUrl, nav)).toBe(
      `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(streamUrl)}`,
    )
  })

  it('detects iPadOS desktop-mode Safari as iOS', () => {
    const nav = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      maxTouchPoints: 5,
    }

    expect(detectVlcPlatform(nav)).toEqual({ isIOS: true, isMac: false, isWindows: false })
  })

  it('uses the desktop handler weblink format on macOS', () => {
    const nav = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    }

    expect(getVlcLink(new URL(streamUrl), nav)).toBe(`vlc://weblink?url=${encodeURIComponent(streamUrl)}`)
  })

  it('keeps the standard VLC handler format on Windows', () => {
    const nav = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0',
      platform: 'Win32',
    }

    expect(getVlcLink(streamUrl, nav)).toBe(`vlc://${streamUrl}`)
  })
})
