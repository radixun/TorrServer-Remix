import styled, { css } from 'styled-components'

export const Header = styled.div`
  ${({
    theme: {
      app: { paperColor, textColor, borderColor },
    },
  }) => css`
    background: ${paperColor};
    color: ${textColor};
    font-size: 20px;
    font-weight: 600;
    border-bottom: 1px solid ${borderColor};
    box-shadow: 0 4px 12px rgb(15 23 42 / 8%);
    padding: 15px 24px;
    position: relative;
  `}
`

export const ButtonWrapper = styled.div`
  padding: 20px;
  display: flex;
  justify-content: flex-end;

  > :not(:last-child) {
    margin-right: 10px;
  }
`
