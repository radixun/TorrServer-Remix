import styled, { css } from 'styled-components'
import { Dialog } from '@material-ui/core'

export const DiscoveryWrapper = styled.div`
  ${({
    theme: {
      app: { borderColor, contentBGColor, paperColor, textColor, mutedTextColor, hoverBGColor, accentColor },
    },
  }) => css`
    grid-area: content;
    min-width: 0;
    overflow: auto;
    border-right: 1px solid ${borderColor};
    border-bottom: 1px solid ${borderColor};
    border-radius: 0 0 10px 0;
    background: ${contentBGColor};
    color: ${textColor};
    padding: 22px 26px;

    @media (max-width: 700px) {
      border-left: 1px solid ${borderColor};
      border-radius: 0 0 8px 8px;
      padding: 16px;
    }

    .discover-toolbar {
      display: grid;
      grid-template-columns: 1.3fr 150px 180px 110px 110px 120px;
      gap: 12px;
      align-items: start;
      margin-bottom: 18px;
    }

    .discover-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-bottom: 18px;
    }

    .discover-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 18px;
      align-items: stretch;
    }

    .discover-card {
      min-width: 0;
      border: 1px solid ${borderColor};
      border-radius: 8px;
      overflow: hidden;
      background: ${paperColor};
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .discover-poster {
      width: 100%;
      aspect-ratio: 2 / 3;
      object-fit: cover;
      background: ${hoverBGColor};
      display: block;
    }

    .discover-empty-poster {
      aspect-ratio: 2 / 3;
      display: grid;
      place-items: center;
      color: ${mutedTextColor};
      background: ${hoverBGColor};
    }

    .discover-card-body {
      padding: 12px;
      display: grid;
      grid-template-rows: minmax(44px, auto) auto minmax(72px, 1fr) auto;
      gap: 10px;
      align-content: stretch;
      min-height: 224px;
    }

    .discover-title {
      font-size: 16px;
      line-height: 1.25;
      font-weight: 700;
      color: ${textColor};
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }

    .discover-meta,
    .discover-overview,
    .discover-rating {
      color: ${mutedTextColor};
      font-size: 13px;
      line-height: 1.4;
    }

    .discover-overview {
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 72px;
    }

    .discover-rating strong {
      color: ${accentColor};
    }

    .discover-card-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      align-self: end;

      .MuiButton-root {
        min-width: 0;
      }

      .MuiButton-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .discover-state {
      min-height: 260px;
      display: grid;
      place-items: center;
      color: ${mutedTextColor};
      text-align: center;
    }

    @media (max-width: 1180px) {
      .discover-toolbar {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    @media (max-width: 760px) {
      .discover-toolbar {
        grid-template-columns: 1fr;
      }

      .discover-actions {
        justify-content: stretch;
      }

      .discover-actions button {
        flex: 1;
      }

      .discover-grid {
        grid-template-columns: 1fr;
      }

      .discover-card {
        grid-template-columns: 118px minmax(0, 1fr);
        grid-template-rows: auto;
      }

      .discover-poster,
      .discover-empty-poster {
        height: 178px;
      }

      .discover-card-actions {
        grid-template-columns: 1fr;
      }
    }
  `}
`

export const DiscoveryDetailsDialog = styled(Dialog)`
  ${({
    theme: {
      app: { borderColor, contentBGColor, textColor, mutedTextColor, hoverBGColor, accentColor },
    },
  }) => css`
    .MuiDialog-paper {
      width: min(1120px, calc(100vw - 48px));
      max-width: 1120px;
      max-height: calc(100vh - 64px);
      background: ${contentBGColor};
      color: ${textColor};
      border: 1px solid ${borderColor};
      border-radius: 8px;
      overflow: hidden;
    }

    .discover-detail-content {
      padding: 0;
      overflow: auto;
    }

    .discover-detail-shell {
      display: grid;
      grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
      gap: 28px;
      padding: 28px;
      min-height: 520px;
    }

    .discover-detail-side {
      min-width: 0;
    }

    .discover-detail-poster {
      width: 100%;
      aspect-ratio: 2 / 3;
      object-fit: cover;
      display: block;
      border-radius: 8px;
      border: 1px solid ${borderColor};
      background: ${hoverBGColor};
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
    }

    .discover-detail-poster-empty {
      display: grid;
      place-items: center;
      color: ${mutedTextColor};
    }

    .discover-detail-poster-empty svg {
      font-size: 64px;
    }

    .discover-detail-main {
      min-width: 0;
      display: grid;
      grid-template-rows: auto auto auto auto minmax(0, 1fr);
      gap: 16px;
      align-content: start;
    }

    .discover-detail-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
    }

    .discover-detail-title {
      font-size: clamp(28px, 4vw, 42px);
      line-height: 1.05;
      font-weight: 800;
      letter-spacing: 0;
      color: ${textColor};
      overflow-wrap: anywhere;
    }

    .discover-detail-original {
      margin-top: 8px;
      color: ${mutedTextColor};
      font-size: 16px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .discover-detail-facts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .discover-detail-facts span,
    .discover-detail-links .MuiButton-root {
      min-height: 32px;
      border-radius: 4px;
      border-color: ${borderColor};
      color: ${textColor};
      background: rgba(255, 255, 255, 0.035);
    }

    .discover-detail-facts span {
      display: inline-flex;
      align-items: center;
      padding: 0 12px;
      color: ${mutedTextColor};
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .discover-detail-overview {
      max-width: 760px;
      color: ${textColor};
      font-size: 15px;
      line-height: 1.65;
      margin: 0;
    }

    .discover-detail-links {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .discover-detail-links .MuiButton-root {
      color: ${accentColor};
      font-weight: 700;
      text-transform: none;
    }

    .discover-trailer-panel {
      min-width: 0;
      width: min(440px, 100%);
      border: 1px solid ${borderColor};
      border-radius: 8px;
      overflow: hidden;
      background: #000;
    }

    .discover-video {
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 0;
      display: block;
      background: #000;
    }

    .discover-detail-actions {
      padding: 16px 28px 24px;
      border-top: 1px solid ${borderColor};
      background: rgba(0, 0, 0, 0.12);
      gap: 10px;
    }

    @media (max-width: 860px) {
      .MuiDialog-paper {
        width: calc(100vw - 24px);
        max-height: calc(100vh - 24px);
      }

      .discover-detail-shell {
        grid-template-columns: 130px minmax(0, 1fr);
        gap: 18px;
        padding: 18px;
        min-height: 0;
      }

      .discover-detail-main {
        grid-template-rows: auto;
        gap: 12px;
      }

      .discover-detail-title {
        font-size: 24px;
        line-height: 1.12;
      }

      .discover-detail-original {
        font-size: 14px;
      }

      .discover-detail-overview {
        font-size: 14px;
        line-height: 1.55;
      }

      .discover-detail-actions {
        padding: 14px 18px 18px;
      }
    }

    @media (max-width: 560px) {
      .discover-detail-shell {
        grid-template-columns: 1fr;
      }

      .discover-detail-side {
        display: none;
      }

      .discover-detail-actions {
        display: grid;
        grid-template-columns: 1fr;
      }
    }
  `}
`
