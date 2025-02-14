/**
 * styles/dragDropColumns.ts
 * Styled components to support drag-and-drop columns in a table.
 */
import styled from 'styled-components';

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;

  th,
  td {
    text-align: left;
    padding: 0.5rem;
    border: 1px solid #3a2d5d;
  }

  th {
    background-color: #2a1f4a;
    user-select: none; /* prevent text selection while dragging */
  }
`;

export const TableRow = styled.tr<{ isHighlighted: boolean }>`
  background-color: ${({ isHighlighted }) => (isHighlighted ? '#2a1f4a' : 'transparent')};

  &:hover {
    background-color: #221841;
  }
`;

export const DraggableTH = styled.th`
  cursor: move; /* Show a move cursor to indicate draggable column */
  &:hover {
    background-color: #3b2962;
  }
`;
