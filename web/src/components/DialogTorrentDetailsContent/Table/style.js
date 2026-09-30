import styled, { css } from 'styled-components'

const viewedIndicator = css`
  ${({
    theme: {
      table: { defaultPrimaryColor },
    },
  }) => css`
    :before {
      content: '';
      width: 22px;
      height: 22px;
      background: rgba(24, 201, 194, 0.16);
      border-radius: 50%;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      border: 1px solid ${defaultPrimaryColor};
    }

    :after {
      content: '✓';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -53%);
      color: ${defaultPrimaryColor};
      font-size: 14px;
      font-weight: 900;
    }
  `}
`
export const TableStyle = styled.table`
  ${({
    theme: {
      table: {
        borderColor,
        defaultRowColor,
        viewedRowColor,
        hoverRowColor,
        textColor,
        buttonBorderColor,
        buttonTextColor,
        buttonBGColor,
        buttonHoverBGColor,
        buttonHoverBorderColor,
        headerBGColor,
        headerTextColor,
        mutedTextColor,
        primaryButtonBGColor,
        primaryButtonTextColor,
        offlineActionBGColor,
        dangerTextColor,
      },
    },
  }) => css`
    border-collapse: collapse;
    margin: 0;
    font-size: 14px;
    width: 100%;
    table-layout: fixed;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid ${borderColor};
    box-shadow: 0 12px 28px rgb(0 0 0 / 10%);
    color: ${textColor};

    thead tr {
      background: ${headerBGColor};
      color: ${headerTextColor};
      text-align: left;
      text-transform: uppercase;
    }

    th {
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    th,
    td {
      padding: 12px 14px;
    }

    tbody tr {
      border-bottom: 1px solid ${borderColor};
      background: ${defaultRowColor};
      transition: background 0.15s;

      :hover {
        background: ${hoverRowColor};
      }

      :last-of-type {
        border-bottom: 0;
      }

      &.viewed-file-row {
        background: ${viewedRowColor};
      }
    }

    td {
      &.viewed-file-indicator {
        position: relative;

        ${viewedIndicator}
      }
    }

    td[data-label='season'],
    td[data-label='episode'],
    td[data-label='resolution'],
    td[data-label='duration'],
    td[data-label='size'] {
      white-space: nowrap;
      font-size: 14px;
    }

    td[data-label='name'] {
      strong {
        display: block;
        color: ${textColor};
        font-size: 16px;
        line-height: 1.22;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      span {
        display: block;
        margin-top: 4px;
        color: ${mutedTextColor};
        font-size: 13px;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .actions-cell {
      padding-left: 8px;
      padding-right: 14px;
    }

    .file-action-stack {
      display: grid;
      gap: 7px;
    }

    .button-cell {
      display: grid;
      grid-template-columns: minmax(100px, 1fr) 54px 40px;
      gap: 8px;
      min-width: 0;

      .MuiButton-root,
      button {
        border-color: ${buttonBorderColor};
        color: ${buttonTextColor};
        background: ${buttonBGColor};
        font-weight: 700;
        min-height: 36px;
        min-width: 0;
        padding-left: 8px;
        padding-right: 8px;
        white-space: nowrap;
        border-radius: 8px;
        font-size: 12px;
        line-height: 1.1;
        text-transform: none;
      }

      .icon-action {
        padding-left: 0;
        padding-right: 0;
      }

      .MuiButton-root:hover,
      button:hover {
        border-color: ${buttonHoverBorderColor};
        background: ${buttonHoverBGColor};
      }

      > :first-child {
        .MuiButton-root,
        button {
          color: ${primaryButtonTextColor};
          border-color: transparent;
          background: ${primaryButtonBGColor};
        }
      }

      .MuiButton-label,
      button span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      svg {
        flex: 0 0 auto;
      }
    }

    .offline-file-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px;

      .MuiButton-root,
      button {
        min-width: 0;
        min-height: 34px;
        padding: 5px 8px;
        border: 1px solid ${buttonBorderColor};
        border-radius: 8px;
        background: ${offlineActionBGColor};
        color: ${buttonTextColor};
        font-size: 11px;
        font-weight: 700;
        line-height: 1.1;
        text-transform: none;
      }

      .MuiButton-label,
      button span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .delete-offline-file {
        width: 38px;
        padding: 0;
        color: ${dangerTextColor};
      }
    }

    @media (max-width: 1240px) {
      display: none;
    }
  `}
`

export const ShortTableWrapper = styled.div`
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr;
  display: none;

  @media (max-width: 1240px) {
    display: grid;
  }
`

export const ShortTable = styled.div`
  ${({
    isViewed,
    theme: {
      table: {
        borderColor,
        defaultRowColor,
        viewedRowColor,
        textColor,
        buttonBorderColor,
        buttonTextColor,
        buttonBGColor,
        buttonHoverBGColor,
        buttonHoverBorderColor,
        mutedTextColor,
        primaryButtonBGColor,
        primaryButtonTextColor,
        offlineActionBGColor,
        dangerTextColor,
      },
    },
  }) => css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    grid-template-areas:
      'name buttons'
      'data buttons'
      'storage storage';
    align-items: center;
    gap: 6px 12px;
    width: 100%;
    min-height: 76px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid ${borderColor};
    background: ${isViewed ? viewedRowColor : defaultRowColor};
    box-shadow: none;

    .short-table {
      &-name {
        display: block;
        grid-area: name;
        min-width: 0;
        color: ${textColor};
        font-size: 15px;
        font-weight: 700;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        @media (max-width: 880px) {
          font-size: 15px;
        }
      }
      &-data {
        grid-area: data;
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        min-width: 0;
      }
      &-field {
        display: inline-grid;
        grid-auto-flow: column;
        align-items: center;
        gap: 5px;
        min-width: 0;
        max-width: 100%;
        padding: 4px 8px;
        background: ${buttonBGColor};
        border: 1px solid ${borderColor};
        border-radius: 999px;

        &-name {
          color: ${mutedTextColor};
          font-size: 11px;
          font-weight: 700;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          @media (max-width: 880px) {
            font-size: 11px;
          }
        }

        &-value {
          color: ${textColor};
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
          position: relative;
          min-height: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          @media (max-width: 880px) {
            font-size: 13px;
          }
        }
      }

      &-viewed-indicator {
        ${isViewed && viewedIndicator}
      }

      &-buttons {
        grid-area: buttons;
        display: grid;
        grid-template-columns: minmax(104px, 1fr) 54px 42px;
        align-items: center;
        gap: 8px;

        .MuiButton-root,
        button {
          border-color: ${buttonBorderColor};
          color: ${buttonTextColor};
          background: ${buttonBGColor};
          font-weight: 700;
          min-height: 36px;
          min-width: 0;
          padding-left: 8px;
          padding-right: 8px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.1;
          text-transform: none;
          white-space: nowrap;
        }

        .icon-action {
          padding-left: 0;
          padding-right: 0;
        }

        .MuiButton-root:hover,
        button:hover {
          border-color: ${buttonHoverBorderColor};
          background: ${buttonHoverBGColor};
        }

        .MuiButton-label,
        button span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        > :first-child {
          .MuiButton-root,
          button {
            color: ${primaryButtonTextColor};
            border-color: transparent;
            background: ${primaryButtonBGColor};
          }
        }

        @media (max-width: 410px) {
          grid-template-columns: minmax(96px, 1fr) 50px 40px;
          gap: 6px;
        }
      }
    }

    .offline-file-actions {
      grid-area: storage;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px;

      .MuiButton-root,
      button {
        min-width: 0;
        min-height: 36px;
        padding: 5px 9px;
        border: 1px solid ${buttonBorderColor};
        border-radius: 8px;
        background: ${offlineActionBGColor};
        color: ${buttonTextColor};
        font-size: 12px;
        font-weight: 700;
        line-height: 1.1;
        text-transform: none;
      }

      .MuiButton-label,
      button span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .delete-offline-file {
        width: 40px;
        padding: 0;
        color: ${dangerTextColor};
      }
    }

    @media (max-width: 700px) {
      grid-template-columns: 1fr;
      grid-template-areas:
        'name'
        'data'
        'buttons'
        'storage';
      align-items: stretch;
    }
  `}
`
