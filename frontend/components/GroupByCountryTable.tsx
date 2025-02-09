import React from 'react';
import styled from 'styled-components';

interface Player {
  id: number;
  rank: number;
  name: string;
  country: string;
  money: number;
}

interface Props {
  data: Player[];
  isGrouped: boolean;
}

export default function GroupByCountryTable({ data, isGrouped }: Props) {
  if (!isGrouped) {
    // Gruplama yoksa normal tablo
    return (
      <Table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Username</th>
            <th>Country</th>
            <th>Money</th>
          </tr>
        </thead>
        <tbody>
          {data.map((player) => (
            <tr key={player.id}>
              <td>{player.rank}</td>
              <td>{player.name}</td>
              <td>{player.country || 'Unknown'}</td>
              <td>{player.money.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  }

  // Gruplama aktifse, country’e göre objeye ayır
  const byCountry: Record<string, Player[]> = {};
  data.forEach((p) => {
    const c = p.country || 'Unknown';
    if (!byCountry[c]) {
      byCountry[c] = [];
    }
    byCountry[c].push(p);
  });

  return (
    <div>
      {Object.entries(byCountry).map(([country, players]) => (
        <details key={country} open>
          <summary>
            {country} ({players.length} player{players.length > 1 ? 's' : ''})
          </summary>
          <Table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Username</th>
                <th>Money</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td>{player.rank}</td>
                  <td>{player.name}</td>
                  <td>{player.money.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </details>
      ))}
    </div>
  );
}

const Table = styled.table`
  width: 100%;
  border: 1px solid #ccc;
  border-collapse: collapse;
  margin-bottom: 1rem;

  th,
  td {
    border: 1px solid #ccc;
    padding: 8px;
  }
  th {
    background: #eee;
  }
`;
