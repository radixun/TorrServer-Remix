import { createGlobalStyle, css } from 'styled-components'

import { standaloneMedia } from './standaloneMedia'

export default createGlobalStyle`
  *,
  *::before,
  *::after {  
    margin: 0;
    padding: 0;
    box-sizing: inherit;
  }

  body {  
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    letter-spacing: 0;
    -webkit-tap-highlight-color: transparent;


    ${standaloneMedia(css`
      height: 100vh;
    `)}
  }

  button {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0;
  }
`
