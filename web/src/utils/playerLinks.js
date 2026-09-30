const getNavigator = () => {
  if (typeof navigator === 'undefined') return null
  return navigator
}

export const detectVlcPlatform = (nav = getNavigator()) => {
  const userAgent = nav?.userAgent || ''
  const platform = nav?.userAgentData?.platform || nav?.platform || ''
  const lowerPlatform = platform.toLowerCase()

  const isIPadDesktopMode = userAgent.includes('Macintosh') && nav?.maxTouchPoints > 1
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || isIPadDesktopMode
  const isMac = !isIOS && (userAgent.includes('Macintosh') || lowerPlatform.includes('mac'))
  const isWindows = userAgent.includes('Windows') || lowerPlatform.includes('win')

  return { isIOS, isMac, isWindows }
}

export const getVlcLink = (url, nav) => {
  const streamUrl = url?.toString ? url.toString() : String(url)
  const { isIOS, isMac } = detectVlcPlatform(nav)

  if (isIOS) {
    return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(streamUrl)}`
  }

  if (isMac) {
    return `vlc://weblink?url=${encodeURIComponent(streamUrl)}`
  }

  return `vlc://${streamUrl}`
}
