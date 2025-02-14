/**
 * styles/leaderboardTable.ts
 * Styled components for the LeaderboardTable module.
 */

import styled from 'styled-components';
import { CommonButton } from './common';

export const Message = styled.div`
  text-align: center;
  margin-top: 2rem;
  font-size: 1.2rem;
`;

export const ButtonsContainer = styled.div`
  margin-bottom: 1rem;
  display: flex;
  gap: 0.5rem;
`;

export const Button = styled(CommonButton)`
  /* We can override or extend styles here if needed */
`;
