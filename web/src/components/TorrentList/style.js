import styled, { css } from 'styled-components'

export default styled.div`
  ${({
    $isButton,
    theme: {
      addDialog: { notificationSuccessBGColor, languageSwitchBGColor, fontColor },
      app: { accentColor, borderColor },
    },
  }) => css`
    display: grid;
    place-items: center;
    padding: 20px 40px;
    border-radius: 10px;
    color: ${fontColor};
    border: 1px solid transparent;
    font: inherit;

    ${$isButton &&
    css`
      background: ${notificationSuccessBGColor};
      border-color: ${borderColor};
      transition: background-color 0.2s, border-color 0.2s, transform 0.2s;
      cursor: pointer;

      :hover {
        background: ${languageSwitchBGColor};
        border-color: ${accentColor};
        transform: translateY(-1px);
      }

      :focus-visible {
        outline: 3px solid ${accentColor};
        outline-offset: 3px;
      }
    `}

    .empty-state-icon {
      width: 120px;
      height: 120px;
      color: ${accentColor};
    }

    .icon-label {
      font-size: 20px;
    }
  `}
`
