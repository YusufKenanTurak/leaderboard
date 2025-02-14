/**
 * components/DragDropColumns.tsx
 * A table that allows columns to be drag-and-dropped (reordered).
 * Uses basic HTML5 drag and drop events on table headers.
 */

import React, { useState } from 'react';
import { Player } from '../lib/api';
import {
  Table,
  TableRow,
  DraggableTH
} from '../styles/dragDropColumns';

interface Props {
  data: Player[];
  highlightedPlayerId?: number;
}

/**
 * We define the initial columns that will be displayed in the table.
 * Each column has a 'key' (matching a Player property) and a 'label'.
 */
const INITIAL_COLUMNS = [
  { key: 'rank',    label: 'Rank' },
  { key: 'name',    label: 'Player' },
  { key: 'country', label: 'Country' },
  { key: 'money',   label: 'Money' }
];

export default function DragDropColumns({ data, highlightedPlayerId }: Props) {
  // We store our columns in state so we can reorder them upon dragging.
  const [columns, setColumns] = useState(INITIAL_COLUMNS);

  /**
   * Called when dragging begins on a <th>. We store the column index in the
   * dataTransfer object so we know which column is being dragged.
   */
  function handleDragStart(e: React.DragEvent<HTMLTableHeaderCellElement>, startIndex: number) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(startIndex));
  }

  /**
   * Allow dropping on table headers by preventing the default "no-drop" behavior.
   */
  function handleDragOver(e: React.DragEvent<HTMLTableHeaderCellElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  /**
   * When the user drops a header onto another, we reorder the columns array.
   */
  function handleDrop(e: React.DragEvent<HTMLTableHeaderCellElement>, dropIndex: number) {
    e.preventDefault();
    const startIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (startIndex === dropIndex) return;

    const updated = reorder(columns, startIndex, dropIndex);
    setColumns(updated);
  }

  /**
   * reorder: A helper function to move an item in an array from 'startIndex'
   * to 'endIndex'.
   */
  function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  }

  return (
    <Table>
      <thead>
        <tr>
          {columns.map((col, index) => (
            <DraggableTH
              key={col.key}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              {col.label}
            </DraggableTH>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((player) => (
          <TableRow
            key={player.id}
            id={`player-row-${player.id}`}
            isHighlighted={highlightedPlayerId === player.id}
          >
            {columns.map((col) => (
              <td key={col.key}>
                {renderCell(player, col.key as keyof Player)}
              </td>
            ))}
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}

/**
 * renderCell: A helper function that returns the appropriate property from Player
 * based on the column key. If a certain property doesn't exist on 'Player',
 * you might extend or customize this logic.
 */
function renderCell(player: Player, key: keyof Player) {
  return player[key] ?? '–';
}
