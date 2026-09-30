import styled, { css } from 'styled-components'

export const TorrentCard = styled.div`
  ${({
    theme: {
      torrentCard: { cardPrimaryColor, borderColor },
    },
  }) => css`
    border-radius: 8px;
    display: grid;
    grid-template-columns: 126px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 42px;
    grid-template-areas:
      'poster description'
      'poster buttons';
    gap: 12px;
    padding: 12px;
    min-height: 198px;
    background: ${cardPrimaryColor};
    border: 1px solid ${borderColor};
    box-shadow: 0 10px 26px rgb(15 23 42 / 7%);

    @media (max-width: 1260px), (max-height: 500px) {
      grid-template-columns: 96px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) 42px;
      min-height: 164px;
    }

    @media (max-width: 770px) {
      grid-template-columns: 76px minmax(0, 1fr);
      grid-template-rows: minmax(112px, auto) 40px;
      gap: 12px;
      min-height: 188px;
    }
  `}
`

export const TorrentCardPoster = styled.button`
  grid-area: poster;
  border-radius: 8px;
  border: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  overflow: hidden;
  text-align: center;
  cursor: pointer;
  transition: 0.2s;
  position: relative;

  :hover {
    filter: brightness(0.92);
  }

  :focus-visible {
    outline: 3px solid ${({ theme }) => theme.torrentCard.accentCardColor};
    outline-offset: 2px;
  }

  ${({
    $hasPoster,
    theme: {
      torrentCard: { accentCardColor, posterEmptyBGColor },
    },
  }) =>
    $hasPoster
      ? css`
          img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 8px;
          }
        `
      : css`
          display: grid;
          place-items: center;
          background: ${posterEmptyBGColor};
          border: 1px solid ${accentCardColor};

          svg {
            transform: translateY(-3px);
          }
        `};

  @media (max-width: 1260px), (max-height: 500px) {
    svg {
      width: 50%;
    }
  }
`

export const TorrentCardButtons = styled.div`
  grid-area: buttons;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: stretch;
  gap: 10px;
  min-width: 0;

  @media (max-width: 340px) {
    gap: 5px;
  }
`
export const TorrentCardDescription = styled.div`
  ${({
    theme: {
      torrentCard: { cardSecondaryColor, accentCardColor, titleColor, statColor, buttonBGColor, borderColor },
    },
  }) => css`
    grid-area: description;
    background: ${cardSecondaryColor};
    border-radius: 8px;
    padding: 4px 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) max-content;
    gap: 10px;
    min-width: 0;
    overflow: hidden;

    @media (max-width: 770px) {
      grid-template-rows: minmax(44px, max-content) max-content;
      gap: 8px;
      align-content: space-between;
    }

    .description-title-wrapper {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;

      @media (max-width: 770px) {
        min-height: 44px;
      }
    }

    // .description-title-wrapper > .description-section-name {
    //   display: flex;
    //   flex-wrap: nowrap;
    //   justify-content: space-between;
    //   self-align: end;
    // }

    // .description-category-wrapper {
    //   display: inline-flex;
    //   color: #1a1a1a;
    // }

    .description-section-name {
      text-transform: uppercase;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0;
      color: ${accentCardColor};

      @media (max-width: 770px) {
        font-size: 0.5rem;
        line-height: 10px;
      }
    }

    .description-status-wrapper {
      display: inline-block;
      height: 8px;
      margin-inline-end: 4px;
      vertical-align: baseline;
    }

    .description-torrent-title {
      overflow: hidden;
      word-break: normal;
      overflow-wrap: anywhere;
      color: ${titleColor};
      font-size: 18px;
      font-weight: 600;
      line-height: 1.25;
      margin-top: 8px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;

      @media (max-width: 770px) {
        font-size: 12px;
        line-height: 1.2;
        margin-top: 4px;
        -webkit-line-clamp: 2;
      }

      @media (max-width: 410px) {
        font-size: 12px;
      }
    }

    .description-statistics-wrapper {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      min-width: 0;
      align-self: end;

      @media (max-width: 770px) {
        align-items: flex-start;
        flex-direction: column;
        gap: 4px;
      }
    }

    .description-genres {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      min-width: 0;

      span {
        padding: 5px 9px;
        border: 1px solid ${borderColor};
        border-radius: 999px;
        background: ${buttonBGColor};
        color: ${statColor};
        font-size: 10px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
      }

      @media (max-width: 770px) {
        gap: 4px;

        span {
          padding: 4px 7px;
          font-size: 8px;
        }
      }
    }

    .description-statistics-element-wrapper {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: 100%;
      min-height: 32px;
      padding: 0 12px;
      border-radius: 999px;
      background: ${buttonBGColor};
      border: 1px solid ${borderColor};
    }

    .description-statistics-element-value {
      color: ${statColor};
      font-size: 13px;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 0;
      margin-left: 0;
      white-space: nowrap;

      @media (max-width: 1260px), (max-height: 500px) {
        font-size: 0.7rem;
        margin-bottom: 0;
        margin-left: 0;
      }
    }

    .description-statistics-element-value {
      @media (max-width: 770px) {
        font-size: 0.72rem;
      }

      @media (max-width: 410px) {
        font-size: 9px;
      }
    }

    .description-statistics-element-value {
      @media (max-width: 410px) {
        font-size: 10px;
      }
    }
  `}
`

export const StyledButton = styled.button`
  ${({
    theme: {
      torrentCard: {
        buttonBGColor,
        accentCardColor,
        buttonHoverBGColor,
        playColor,
        deleteColor,
        deleteBorderColor,
        deleteHoverBGColor,
        deleteHoverBorderColor,
      },
    },
    $variant,
  }) => css`
    border-radius: 8px;
    border: 1px solid ${$variant === 'delete' ? deleteBorderColor : playColor};
    cursor: pointer;
    transition: 0.18s;
    display: flex;
    align-items: center;
    justify-content: center;
    text-transform: none;
    background: ${$variant === 'delete' ? deleteHoverBGColor : buttonBGColor};
    color: ${$variant === 'delete' ? deleteColor : playColor};
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0;
    padding: 0 10px;
    min-height: 40px;
    min-width: 0;
    width: 100%;
    box-shadow: 0 6px 14px rgb(15 23 42 / 4%);

    svg {
      width: 18px;
      height: 18px;
    }

    :hover {
      background: ${$variant === 'delete' ? deleteHoverBGColor : buttonHoverBGColor};
      border-color: ${$variant === 'delete' ? deleteHoverBorderColor : accentCardColor};
      transform: translateY(-1px);
    }

    > :first-child {
      margin-right: 8px;
    }

    @media (max-width: 1260px), (max-height: 500px) {
      padding: 0 10px;
      justify-content: center;
      font-size: 0.8rem;

      svg {
        display: block;
      }
    }

    @media (max-width: 770px) {
      font-size: 0.7rem;
    }

    @media (max-width: 420px) {
      font-size: 0.6rem;
      padding: 7px 5px;

      span {
        display: none;
      }

      > :first-child {
        margin-right: 0;
      }
    }

    ${$variant === 'delete' &&
    css`
      min-width: 44px;
      padding: 0;

      > :first-child {
        margin-right: 0;
      }
    `}
  `}
`

export const StatusIndicators = styled.div`
  ${({ color }) => css`
    height: 8px;
    width: 8px;
    background-color: ${color};
    border-radius: 50%;
    position: relative;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  `}
`
