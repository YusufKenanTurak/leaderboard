/**
 * styles/homePage.ts
 * Styled components used specifically by HomePage.tsx
 */
import styled from 'styled-components';

export const MainContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
`;

export const HeaderArea = styled.div`
  text-align: center;
  margin-bottom: 2rem;
`;

export const Logo = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
`;

export const LeaderboardTitle = styled.h1`
  font-size: 2.5rem;
  color: #fff;
  margin-bottom: 0;
`;

export const Message = styled.div`
  text-align: center;
  margin-top: 2rem;
  font-size: 1.2rem;
`;

export const RankInfo = styled.div`
  text-align: center;
  font-weight: bold;
  margin-bottom: 1rem;
  font-size: 1.2rem;
`;
