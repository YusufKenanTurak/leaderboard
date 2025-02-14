/**
 * modules/LeaderboardSearchBar.tsx
 * A reusable search bar for the leaderboard: includes the input, suggestions, and group toggle.
 */

import React, { FormEvent } from 'react';
import { AutoCompleteItem } from '../lib/api';
import {
  SearchForm,
  SearchContainer,
  SearchInput,
  Button
} from '../styles/leaderboardSearchBar';
import SuggestionsDropdown from '../styles/suggestionsDropdown';

interface Props {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  suggestions: AutoCompleteItem[];
  showSuggestions: boolean;
  onSelectSuggestion: (item: AutoCompleteItem) => void;
  onSearch: (e: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onGroupToggle: () => void;
  isGrouped: boolean;
}

export default function LeaderboardSearchBar({
  searchTerm,
  setSearchTerm,
  suggestions,
  showSuggestions,
  onSelectSuggestion,
  onSearch,
  onClear,
  onGroupToggle,
  isGrouped
}: Props) {
  return (
    <SearchForm onSubmit={onSearch}>
      <SearchContainer>
        <SearchInput
          type="text"
          placeholder="Search by name or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {showSuggestions && suggestions.length > 0 && (
          <SuggestionsDropdown
            suggestions={suggestions}
            onSelect={onSelectSuggestion}
          />
        )}
      </SearchContainer>
      <Button type="submit">Search</Button>
      <Button type="button" onClick={onClear}>Clear</Button>
      <Button type="button" onClick={onGroupToggle}>
        {isGrouped ? 'Ungroup' : 'Group by Country'}
      </Button>
    </SearchForm>
  );
}
