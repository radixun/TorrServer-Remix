import { standaloneMedia } from 'style/standaloneMedia'
import styled, { css } from 'styled-components'

export const pwaFooterHeight = 90

export default styled.div`
  background: #575757;
  color: #fff;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  grid-area: footer;
  width: 100%;
  height: ${pwaFooterHeight}px;
  z-index: 5;

  display: none;

  ${standaloneMedia(css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    justify-items: center;
  `)}
`
