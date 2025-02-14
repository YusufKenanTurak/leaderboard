/**
 * styles/leaderboardSearchBar.ts
 * Styled components for the LeaderboardSearchBar module.
 */

import styled from 'styled-components';
import { CommonButton } from './common';

export const SearchForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
  align-items: center;
`;

export const SearchContainer = styled.div`
  position: relative;
`;

export const SearchInput = styled.input`
  width: 240px;
  padding: 0.5rem 1rem;
  border: 1px solid #3a2d5d;
  border-radius: 5px;
  background: #1d1335;
  color: #fff;
  &:focus {
    outline: 2px solid #6f52a7;
  }
`;

export const Button = styled(CommonButton)`
`;
