import { rgba } from 'polished'
import styled, { css } from 'styled-components'

export const DialogContentGrid = styled.div`
  display: grid;
  grid-template-rows: min-content min-content;
  grid-template-areas:
    'main'
    'file-list';
  gap: 24px;
  padding: 22px 32px 32px;

  @media (max-width: 800px) {
    gap: 18px;
    padding: 16px;
  }
`

export const DetailScroll = styled.div`
  min-height: 80vh;
  max-height: calc(100vh - 72px);
  overflow: auto;
`

export const Poster = styled.div`
  ${({
    poster,
    theme: {
      dialogTorrentDetailsContent: { posterBGColor, borderColor },
    },
  }) => css`
    width: 190px;
    height: 285px;
    border-radius: 10px;
    overflow: hidden;
    align-self: start;
    border: 1px solid ${borderColor};
    box-shadow: 0 10px 26px rgb(15 23 42 / 7%);

    ${poster
      ? css`
          img {
            border-radius: 10px;
            height: 100%;
            width: 100%;
            object-fit: cover;
          }
        `
      : css`
          display: grid;
          place-items: center;
          background: ${posterBGColor};

          svg {
            transform: scale(2.5) translateY(-3px);
          }
        `}

    @media (max-width: 840px) {
      ${poster
        ? css`
            width: 104px;
            height: 156px;
          `
        : css`
            display: none;
          `}
    }

    @media (max-width: 520px) {
      ${poster &&
      css`
        width: 92px;
        height: 138px;
      `}
    }
  `}
`
export const MainSection = styled.section`
  ${({
    theme: {
      dialogTorrentDetailsContent: { gradientStartColor, gradientEndColor, borderColor },
    },
  }) => css`
    grid-area: main;
    display: grid;
    grid-template-columns: 190px minmax(340px, 1fr) minmax(292px, 320px);
    gap: 24px;
    padding: 22px;
    background: linear-gradient(145deg, ${gradientStartColor}, ${gradientEndColor});
    border: 1px solid ${borderColor};
    border-radius: 16px;
    box-shadow: 0 18px 40px rgb(0 0 0 / 14%);

    @media (max-width: 1240px) {
      grid-template-columns: min-content minmax(0, 1fr);
    }

    @media (max-width: 840px) {
      grid-template-columns: 104px minmax(0, 1fr);
      gap: 16px;
      padding: 16px;
    }

    @media (max-width: 520px) {
      grid-template-columns: 92px minmax(0, 1fr);
    }
  `}
`

export const HeroContent = styled.div`
  display: grid;
  grid-template-rows: min-content 1fr;
  align-content: start;
  gap: 18px;
  min-width: 0;

  @media (max-width: 840px) {
    gap: 12px;
  }

  @media (max-width: 640px) {
    display: contents;
  }
`

export const HeroTitleRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  min-width: 0;

  .hero-subtitle {
    flex-basis: 100%;
  }
`

export const HeroTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
`

export const HeroTag = styled.span`
  ${({
    theme: {
      dialogTorrentDetailsContent: { borderColor, titleFontColor, progressBGColor },
    },
  }) => css`
    padding: 4px 8px;
    border: 1px solid ${borderColor};
    border-radius: 999px;
    background: ${progressBGColor};
    color: ${titleFontColor};
    font-size: 11px;
    font-weight: 700;
    line-height: 1.1;
    white-space: nowrap;
  `}
`

export const OverviewCard = styled.section`
  ${({
    theme: {
      dialogTorrentDetailsContent: { borderColor, titleFontColor, subNameFontColor, progressBGColor },
    },
  }) => css`
    padding: 20px;
    border: 1px solid ${borderColor};
    border-radius: 12px;
    background: ${progressBGColor};
    min-height: 132px;

    h3 {
      margin: 0 0 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid ${borderColor};
      color: ${titleFontColor};
      font-size: 18px;
      line-height: 1.15;
    }

    p {
      margin: 0;
      color: ${subNameFontColor};
      font-size: 16px;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 6;
      overflow: hidden;
    }

    @media (max-width: 800px) {
      padding: 14px;
      grid-column: 1 / -1;
      min-height: 0;

      p {
        font-size: 14px;
        display: block;
        overflow: visible;
        -webkit-line-clamp: unset;
      }
    }

    @media (max-width: 640px) {
      margin-top: 2px;
    }
  `}
`

export const DataPanel = styled.aside`
  ${({
    theme: {
      dialogTorrentDetailsContent: { borderColor, titleFontColor, progressBGColor },
      table: { buttonBorderColor, buttonTextColor, buttonBGColor, buttonHoverBGColor, buttonHoverBorderColor },
    },
  }) => css`
    align-self: start;
    padding: 18px;
    border: 1px solid ${borderColor};
    border-radius: 12px;
    background: ${progressBGColor};

    h3 {
      margin: 0 0 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid ${borderColor};
      color: ${titleFontColor};
      font-size: 18px;
      line-height: 1.15;
    }

    .MuiButton-root {
      min-height: 36px;
      border-color: ${buttonBorderColor};
      color: ${buttonTextColor};
      background: ${buttonBGColor};
      font-weight: 700;
      font-size: 12px;
      line-height: 1.1;
      min-width: 0;
      padding: 0 12px;
      text-transform: none;
      white-space: nowrap;
    }

    .MuiButton-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .MuiButton-startIcon {
      flex: 0 0 auto;
      margin-right: 6px;
    }

    .MuiButton-root:hover {
      border-color: ${buttonHoverBorderColor};
      background: ${buttonHoverBGColor};
    }

    @media (max-width: 1240px) {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) max-content;
      align-items: start;
      column-gap: 20px;

      h3 {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 640px) {
      grid-column: 1 / -1;
      grid-template-columns: 1fr;
      padding: 16px;
    }
  `}
`

export const DataFacts = styled.div`
  display: grid;
  gap: 10px;
`

export const DataFact = styled.div`
  ${({
    theme: {
      dialogTorrentDetailsContent: { borderColor, subNameFontColor, titleFontColor },
    },
  }) => css`
    display: grid;
    grid-template-columns: minmax(96px, 0.78fr) minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid ${borderColor};
    border-radius: 8px;

    span {
      color: ${subNameFontColor};
      font-size: 12px;
      font-weight: 700;
    }

    strong {
      color: ${titleFontColor};
      font-size: 15px;
      line-height: 1.2;
      text-align: right;
      word-break: break-word;
    }

    @media (max-width: 360px) {
      grid-template-columns: 1fr;
      gap: 3px;

      strong {
        text-align: left;
      }
    }
  `}
`

export const DataActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;

  .offline-action {
    grid-column: 1 / -1;
  }

  @media (max-width: 360px) {
    grid-template-columns: 1fr;
  }
`

export const OfflineProgress = styled.div`
  margin-top: 12px;
  color: rgba(158, 177, 195, 0.92);
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;

  .MuiLinearProgress-root {
    height: 7px;
    margin-bottom: 7px;
    border-radius: 999px;
    background: rgba(35, 217, 189, 0.12);
  }

  .MuiLinearProgress-bar {
    border-radius: 999px;
    background: linear-gradient(90deg, #45e2d9, #1fbfb9);
  }

  &.offline-error {
    color: #ff9c9c;
  }
`

export const TorrentFilesSection = styled.section`
  ${({
    theme: {
      dialogTorrentDetailsContent: { torrentFilesSectionBGColor },
    },
  }) => css`
    grid-area: file-list;
    padding: 0;
    background: ${torrentFilesSectionBGColor};
  `}
`

export const ContentHeader = styled.div`
  margin-bottom: 12px;
`

export const SectionSubName = styled.div`
  ${({
    theme: {
      dialogTorrentDetailsContent: { subNameFontColor },
    },
  }) => css`
    ${({ mb }) => css`
      ${mb && `margin-top: ${mb / 3}px`};
      ${mb && `margin-bottom: ${mb}px`};
      line-height: 1.35;
      color: ${subNameFontColor};
      font-size: 15px;

      @media (max-width: 800px) {
        ${mb && `margin-top: ${mb / 4}px`};
        ${mb && `margin-bottom: ${mb / 2}px`};
        font-size: 14px;
      }
    `}
  `}
`

export const HeroTitle = styled.div`
  ${({
    color,
    theme: {
      dialogTorrentDetailsContent: { titleFontColor },
    },
  }) => css`
    ${({ mb }) => css`
      ${mb && `margin-bottom: ${mb}px`};
      font-size: 34px;
      font-weight: 700;
      line-height: 1.12;
      word-break: break-word;
      color: ${color || titleFontColor};

      @media (max-width: 800px) {
        font-size: 24px;
        line-height: 1.1;
        ${mb && `margin-bottom: ${mb / 2}px`};
      }
    `}
  `}
`

export const SectionHeading = styled.div`
  ${({
    theme: {
      dialogTorrentDetailsContent: { titleFontColor },
    },
  }) => css`
    color: ${titleFontColor};
    font-size: 28px;
    font-weight: 700;
    line-height: 1.15;

    @media (max-width: 800px) {
      font-size: 22px;
    }
  `}
`

export const SectionTitle = styled(HeroTitle)``

export const SectionHeader = styled.div`
  margin-bottom: 20px;
`

export const WidgetWrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(max-content, 220px));
  gap: 16px;

  @media (max-width: 800px) {
    gap: 15px;
  }
  @media (max-width: 410px) {
    gap: 10px;
  }

  ${({ detailedView }) =>
    detailedView
      ? css`
          @media (max-width: 800px) {
            grid-template-columns: repeat(2, 1fr);
          }
          @media (max-width: 410px) {
            grid-template-columns: 1fr;
          }
        `
      : css`
          @media (max-width: 800px) {
            grid-template-columns: repeat(auto-fit, minmax(max-content, 185px));
          }
          @media (max-width: 480px) {
            grid-template-columns: 1fr 1fr;
          }
          @media (max-width: 390px) {
            grid-template-columns: 1fr;
          }
        `}
`

export const WidgetFieldWrapper = styled.div`
  display: grid;
  grid-template-columns: 40px 1fr;
  grid-template-rows: min-content 42px;
  grid-template-areas:
    'title title'
    'icon value';

  > * {
    display: grid;
    place-items: center;
  }

  @media (max-width: 800px) {
    grid-template-columns: 30px 1fr;
    grid-template-rows: min-content 40px;
  }
`
export const WidgetFieldTitle = styled.div`
  ${({
    theme: {
      dialogTorrentDetailsContent: { titleFontColor },
    },
  }) => css`
    grid-area: title;
    justify-self: start;
    text-transform: uppercase;
    font-size: 11px;
    margin-bottom: 6px;
    font-weight: 700;
    letter-spacing: 0;
    color: ${titleFontColor};
  `}
`

export const WidgetFieldIcon = styled.div`
  ${({ bgColor }) => css`
    grid-area: icon;
    color: ${rgba('#fff', 0.8)};
    background: ${bgColor};
    border-radius: 8px 0 0 8px;

    @media (max-width: 800px) {
      > svg {
        width: 50%;
      }
    }
  `}
`
export const WidgetFieldValue = styled.div`
  ${({
    bgColor,
    theme: {
      dialogTorrentDetailsContent: { widgetFontColor },
    },
  }) => css`
    grid-area: value;
    font-size: 18px;
    font-weight: 600;
    padding: 0 20px 0 0;
    color: ${widgetFontColor};
    background: ${bgColor};
    border-radius: 0 8px 8px 0;
    white-space: nowrap;

    @media (max-width: 800px) {
      font-size: 18px;
      padding: 0 16px 0 0;
    }
  `}
`

export const LoadingProgress = styled.div.attrs(
  ({
    value,
    fullAmount,
    theme: {
      dialogTorrentDetailsContent: { gradientStartColor, gradientEndColor, progressTrackColor, progressBGColor },
    },
  }) => {
    const percentage = Math.min(100, (value * 100) / fullAmount)

    return {
      // this block is here according to styled-components recomendation about fast changable components
      style: {
        background: `linear-gradient(to right, ${gradientStartColor} 0%, ${gradientEndColor} ${percentage}%, ${progressTrackColor} ${percentage}%, ${progressBGColor} 100%)`,
      },
    }
  },
)`
  ${({
    label,
    theme: {
      app: { accentColor },
      dialogTorrentDetailsContent: { titleFontColor, progressBGColor },
    },
  }) => css`
    border: 1px solid ${accentColor};
    padding: 10px 20px;
    border-radius: 8px;
    color: ${titleFontColor};
    background: ${progressBGColor};

    :before {
      content: '${label}';
      display: grid;
      place-items: center;
      font-size: 20px;
    }
  `}
`

export const Divider = styled.div`
  height: 1px;
  background-color: ${({ theme }) => theme.dialogTorrentDetailsContent.borderColor};
  margin: 30px 0;
`
