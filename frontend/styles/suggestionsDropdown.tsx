/**
 * SuggestionsDropdown.tsx
 * A simple autocomplete dropdown list. The style rules have been moved to GlobalStyle,
 * and this component only contains the logic and the HTML structure.
 */

import React from 'react';
import { AutoCompleteItem } from '../lib/api';

interface Props {
  suggestions: AutoCompleteItem[];
  onSelect: (item: AutoCompleteItem) => void;
}

export default function SuggestionsDropdown({ suggestions, onSelect }: Props) {
  // If there are no suggestions, show nothing
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <ul className="dropdown">
      {suggestions.map((item) => (
        <li
          key={item.id}
          className="dropdown-item"
          onClick={() => onSelect(item)}
        >
          {item.name} (ID: {item.id})
        </li>
      ))}
    </ul>
  );
}
