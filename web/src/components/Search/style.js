import styled, { css } from 'styled-components'

export const Content = styled.div`
  ${({
    theme: {
      app: { contentBGColor, textColor, errorTextColor, errorBGColor, borderColor },
    },
  }) => css`
    min-height: 500px;
    background: ${contentBGColor};
    color: ${textColor};
    flex: 1;

    .search-body {
      padding: 20px;
    }

    .search-results {
      min-height: 300px;
      max-height: calc(100vh - 300px);
      overflow-y: auto;
      border-top: 1px solid transparent;
    }

    .search-sort-controls {
      border: 1px solid ${borderColor};
      background: ${contentBGColor};
    }

    .search-state {
      min-height: 220px;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
    }

    .search-error {
      min-height: 0;
      margin: 24px 0;
      padding: 18px 20px;
      border: 1px solid ${errorTextColor};
      border-radius: 8px;
      background: ${errorBGColor};
      color: ${errorTextColor};
      font-weight: 600;
      line-height: 1.45;
    }

    .MuiDivider-root {
      background-color: ${borderColor};
    }
  `}
`

export const Footer = styled.div`
  ${({
    theme: {
      app: { paperColor, borderColor },
    },
  }) => css`
    display: flex;
    justify-content: flex-end;
    padding: 16px;
    border-top: 1px solid ${borderColor};
    background: ${paperColor};
  `}
`
