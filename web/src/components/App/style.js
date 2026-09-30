import { IconButton } from '@material-ui/core'
import { standaloneMedia } from 'style/standaloneMedia'
import styled, { css } from 'styled-components'

import { pwaFooterHeight } from './PWAFooter/style'

export const AppWrapper = styled.div`
  ${({
    theme: {
      app: { appSecondaryColor },
    },
  }) => css`
    box-sizing: border-box;
    height: 100%;
    background: ${appSecondaryColor};
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    grid-template-rows: 72px minmax(0, 1fr);
    grid-template-areas:
      'head head'
      'side content';
    padding: 16px;

    @media (max-width: 700px) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 72px minmax(0, 1fr);
      grid-template-areas:
        'head'
        'content';
      padding: 8px;
    }

    ${standaloneMedia(css`
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: ${pwaFooterHeight}px minmax(0, 1fr) ${pwaFooterHeight}px;
      grid-template-areas:
        'head'
        'content'
        'footer';
      width: 100%;
      min-width: 0;
      height: 100vh;
      overflow: hidden;
    `)}

    @supports (height: 100dvh) {
      ${standaloneMedia(css`
        height: 100dvh;
      `)}
    }
  `}
`

export const CenteredGrid = styled.div`
  display: grid;
  place-items: center;

  ${standaloneMedia(css`
    height: 100vh;
    width: 100vw;
  `)}
`

export const AppHeader = styled.div`
  ${({
    theme: {
      primary,
      app: { borderColor, textColor },
    },
  }) => css`
    background: ${primary};
    color: ${textColor};
    grid-area: head;
    display: grid;
    grid-auto-flow: column;
    align-items: center;
    grid-template-columns: max-content minmax(0, 1fr) max-content;
    border: 1px solid ${borderColor};
    border-radius: 10px 10px 0 0;
    box-shadow: 0 10px 28px rgb(15 23 42 / 7%);
    padding: 0 24px;
    z-index: 3;

    @media (max-width: 700px) {
      padding: 0 10px;
      border-radius: 8px 8px 0 0;
    }

    ${standaloneMedia(css`
      top: 0;
      left: 0;
      right: 0;
      grid-template-columns: max-content 1fr;
      align-items: end;
      padding: 7px 16px;
      position: fixed;
      width: 100%;
      height: ${pwaFooterHeight}px;
    `)}
  `}
`

export const HeaderActions = styled.div`
  display: flex;
  justify-self: end;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
`

export const AppSidebarStyle = styled.div`
  ${({
    isDrawerOpen,
    theme: {
      app: { sidebarBGColor, sidebarFillColor, borderColor, hoverBGColor, accentColor },
    },
  }) => css`
    grid-area: side;
    width: ${isDrawerOpen ? '320px' : '72px'};
    z-index: 2;
    overflow-x: hidden;
    transition: width 195ms cubic-bezier(0.4, 0, 0.6, 1) 0ms;
    border: 1px solid ${borderColor};
    border-top: 0;
    border-radius: 0 0 0 10px;
    background: ${sidebarBGColor};
    color: ${sidebarFillColor};
    white-space: nowrap;
    /* hide scrollbars */
    overflow-y: scroll;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* Internet Explorer 10+ */
    ::-webkit-scrollbar {
      display: none; /* Safari and Chrome */
      width: 0; /* Remove scrollbar space */
      background: transparent;
    }

    svg {
      fill: ${sidebarFillColor};
    }

    .MuiList-root {
      padding: 10px 0;
    }

    .MuiDivider-root {
      margin: 10px 16px;
      background-color: ${borderColor};
    }

    .MuiListItem-root {
      min-height: 52px;
      padding: 8px 18px;
      color: ${sidebarFillColor};
      transition: background-color 0.18s, color 0.18s;
    }

    .MuiListItem-root:hover {
      background: ${hoverBGColor};
      color: ${accentColor};
    }

    .MuiListItemIcon-root {
      min-width: 36px;
      color: inherit;
    }

    .MuiListItemText-root {
      opacity: ${isDrawerOpen ? 1 : 0};
      transition: opacity 0.12s;
    }

    .MuiListItem-root:hover svg {
      fill: ${accentColor};
    }

    ${standaloneMedia(css`
      display: none;
    `)}

    @media (max-width: 700px) {
      display: none;
    }
  `}
`
export const TorrentListWrapper = styled.div`
  ${({
    theme: {
      app: { borderColor, contentBGColor },
    },
  }) => css`
    grid-area: content;
    padding: 24px 28px;
    overflow: auto;

    display: grid;
    place-content: start;
    grid-template-columns: repeat(auto-fit, minmax(430px, 1fr));
    gap: 22px;
    border-right: 1px solid ${borderColor};
    border-bottom: 1px solid ${borderColor};
    border-radius: 0 0 10px 0;
    background: ${contentBGColor};

    @media (max-width: 1260px), (max-height: 500px) {
      padding: 18px;
      gap: 16px;
      grid-template-columns: repeat(2, 1fr);
    }

    @media (max-width: 1100px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (max-width: 700px) {
      grid-template-columns: 1fr;
      padding: 18px;
      border-left: 1px solid ${borderColor};
      border-radius: 0 0 8px 8px;
    }

    ${standaloneMedia(css`
      height: calc(100vh - ${pwaFooterHeight}px);
      padding-bottom: 105px;
    `)}

    @supports (height: 100dvh) {
      ${standaloneMedia(css`
        height: calc(100dvh - ${pwaFooterHeight * 2}px);
      `)}
    }
  `}
`

export const HeaderToggle = styled.button`
  ${({
    theme: {
      app: { headerToggleColor, borderColor, mutedTextColor, hoverBGColor, accentColor },
    },
  }) => css`
    cursor: pointer;
    appearance: none;
    border-radius: 50%;
    background: ${headerToggleColor};
    border: 1px solid ${borderColor};
    height: 48px;
    width: 48px;
    transition: background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s;
    padding: 0;
    font-family: inherit;
    line-height: 1;
    font-weight: 600;
    display: grid;
    place-items: center;
    color: ${mutedTextColor};
    box-shadow: 0 6px 18px rgb(15 23 42 / 5%);

    :hover {
      background: ${hoverBGColor};
      color: ${accentColor};
    }

    :focus-visible {
      outline: 3px solid ${accentColor};
      outline-offset: 2px;
    }

    @media (max-width: 700px) {
      height: 38px;
      width: 38px;
      font-size: 12px;

      svg {
        width: 17px;
      }
    }
  `}
`

export const GenreFilterToggle = styled(HeaderToggle)`
  position: relative;
  border-color: ${({ $active, theme }) => ($active ? theme.app.accentColor : theme.app.borderColor)};
  color: ${({ $active, theme }) => ($active ? theme.app.accentColor : theme.app.mutedTextColor)};

  ${({ $active, theme }) =>
    $active &&
    css`
      ::after {
        content: '';
        position: absolute;
        top: 7px;
        right: 7px;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: ${theme.app.accentColor};
        box-shadow: 0 0 0 2px ${theme.app.headerToggleColor};
      }
    `}
`

export const StyledIconButton = styled(IconButton)`
  margin-right: 6px;
  color: ${({ theme }) => theme.app.sidebarFillColor};

  &:focus-visible,
  &.Mui-focusVisible {
    outline: 3px solid ${({ theme }) => theme.app.accentColor};
    outline-offset: 2px;
  }

  ${standaloneMedia(css`
    display: none;
  `)}
`
