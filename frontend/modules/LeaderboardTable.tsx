/**
 * modules/LeaderboardTable.tsx
 * Determines how to render the leaderboard: grouped or not grouped.
 */

import React from 'react';
import DragDropColumns from '../components/DragDropColumns';
import { Player } from '../lib/api';
import {
  Message,
  ButtonsContainer,
  Button
} from '../styles/leaderboardTable';

interface Props {
  data: Player[];
  isGrouped: boolean;
  highlightedPlayerId?: number;
  onCollapseAll: () => void;
  onUncollapseAll: () => void;
}

export default function LeaderboardTable({
  data,
  isGrouped,
  highlightedPlayerId,
  onCollapseAll,
  onUncollapseAll
}: Props) {
  if (!data || data.length === 0) {
    return <Message>No data found.</Message>;
  }

  if (isGrouped) {
    const byCountry: Record<string, Player[]> = {};
    data.forEach((p) => {
      const c = p.country || 'Unknown';
      if (!byCountry[c]) {
        byCountry[c] = [];
      }
      byCountry[c].push(p);
    });

    return (
      <>
        <ButtonsContainer>
          <Button onClick={onCollapseAll}>Collapse All</Button>
          <Button onClick={onUncollapseAll}>Uncollapse All</Button>
        </ButtonsContainer>
        {Object.entries(byCountry).map(([country, players]) => (
          <details key={country} open style={{ marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '1.1rem', margin: '0.5rem 0' }}>
              {country} ({players.length} players)
            </summary>
            <DragDropColumns
              data={players}
              highlightedPlayerId={highlightedPlayerId}
            />
          </details>
        ))}
      </>
    );
  }

  // Non-grouped => top100 + near the searched player
  return (
    <DragDropColumns
      data={data}
      highlightedPlayerId={highlightedPlayerId}
    />
  );
}
