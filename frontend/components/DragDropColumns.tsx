import React, { useState } from 'react';
import styled from 'styled-components';

type Column = {
  key: string;
  label: string;
};

const initialColumns: Column[] = [
  { key: 'rank', label: 'Ranking' },
  { key: 'name', label: 'Player Name' },
  { key: 'country', label: 'Country' },
  { key: 'money', label: 'Money' },
];

interface Player {
  id: number;
  name: string;
  country: string;
  rank: number | null;
  money: number;
}

interface Props {
  data: Player[];
  highlightedPlayerId?: number;
}

export default function DragDropColumns({ data, highlightedPlayerId }: Props) {
  const [columns, setColumns] = useState<Column[]>(initialColumns);

  const handleDragStart = (e: React.DragEvent<HTMLTableHeaderCellElement>, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
  };
  const handleDragOver = (e: React.DragEvent<HTMLTableHeaderCellElement>) => {
    e.preventDefault();
  };
  const handleDrop = (e: React.DragEvent<HTMLTableHeaderCellElement>, dropIndex: number) => {
    const dragIndex = Number(e.dataTransfer.getData('text/plain'));
    if (dragIndex === dropIndex) return;

    const newCols = [...columns];
    const [removed] = newCols.splice(dragIndex, 1);
    newCols.splice(dropIndex, 0, removed);
    setColumns(newCols);
  };

  return (
    <Table>
      <thead>
        <tr>
          {columns.map((col, index) => (
            <Th
              key={col.key}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              {col.label}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((player) => {
          const highlight = player.id === highlightedPlayerId;
          return (
            <Tr
              key={player.id}
              id={`player-row-${player.id}`}
              $highlight={highlight}
            >
              {columns.map((col) => {
                if (col.key === 'rank') return <Td key={col.key}>{player.rank || '-'}</Td>;
                if (col.key === 'name') return <Td key={col.key}>{player.name}</Td>;
                if (col.key === 'country') return <Td key={col.key}>{player.country}</Td>;
                if (col.key === 'money') return <Td key={col.key}>{player.money.toLocaleString()}</Td>;
                return <Td key={col.key}>-</Td>;
              })}
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/* Styles */
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  background: #1d1335;
  border: 1px solid #3a2d5d;
  border-radius: 6px;
  overflow: hidden;
`;

const Th = styled.th`
  padding: 12px;
  background-color: #2a1f4a;
  color: #fff;
  text-align: left;
  cursor: move;
  font-weight: 600;
  user-select: none;
  &:not(:last-child) {
    border-right: 1px solid #3a2d5d;
  }
`;

interface TrProps {
  $highlight?: boolean;
}
const Tr = styled.tr<TrProps>`
  background-color: ${(props) => (props.$highlight ? '#4f3a78' : 'transparent')};
  transition: background-color 0.3s;

  &:hover {
    background-color: #38275f;
  }
`;

const Td = styled.td`
  padding: 12px;
  border-top: 1px solid #3a2d5d;
  color: #fff;
  &:not(:last-child) {
    border-right: 1px solid #3a2d5d;
  }
`;
