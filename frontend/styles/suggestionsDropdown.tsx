/**
 * SuggestionsDropdown.tsx
 * Basit bir autocomplete dropdown listesi. Stil kuralları GlobalStyle’a taşınmış,
 * bu bileşen yalnızca mantığı ve HTML yapısını içeriyor.
 */

import React from 'react';
import { AutoCompleteItem } from '../lib/api';

interface Props {
  suggestions: AutoCompleteItem[];
  onSelect: (item: AutoCompleteItem) => void;
}

export default function SuggestionsDropdown({ suggestions, onSelect }: Props) {
  // Eğer suggestions boşsa, hiçbir şey göstermiyoruz
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
