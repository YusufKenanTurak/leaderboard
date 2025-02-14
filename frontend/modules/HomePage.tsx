/**
 * modules/HomePage.tsx
 * 
 * - İki ayrı query: normal, grouped
 * - "Indexing in progress" => 503 yakalanırsa, ekranda "We are indexing..."
 * - Arka planda sorgu tekrarları -> init_done set edilince success 
 *   => indexingInProgress=false, tablo gösterilir.
 */

import React, { useState, useEffect, FormEvent } from 'react';
import Image from 'next/image';
import { useQuery } from 'react-query';
import {
  Player,
  AutoCompleteItem,
  fetchLeaderboard,
  fetchAutocomplete
} from '../lib/api';
import LeaderboardSearchBar from './LeaderboardSearchBar';
import LeaderboardTable from './LeaderboardTable';
import {
  MainContainer,
  HeaderArea,
  Logo,
  LeaderboardTitle,
  Message,
  RankInfo
} from '../styles/homePage';

// Küçük yardımcı
function isIndexingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = (err as Error).message || '';
  return msg.includes('IndexingInProgress') || msg.includes('We are indexing');
}

export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchId, setSearchId] = useState('');
  const [suggestions, setSuggestions] = useState<AutoCompleteItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGrouped, setIsGrouped] = useState(false);

  // Highlight
  const [foundRank, setFoundRank] = useState<number | null>(null);
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<number | null>(null);

  // Indexing
  const [indexingInProgress, setIndexingInProgress] = useState(false);

  // ----------------- Normal Leaderboard --------------------
  const {
    data: normalData,
    isLoading: normalLoading,
    error: normalError,
    refetch: refetchNormal
  } = useQuery(
    ['leaderboard', 'normal', searchId],
    () => fetchLeaderboard(searchId, false),
    {
      keepPreviousData: true,
      onError: (err) => {
        if (isIndexingError(err)) {
          setIndexingInProgress(true);
        }
      },
      onSuccess: () => {
        setIndexingInProgress(false);
      }
    }
  );

  // ----------------- Grouped Leaderboard -------------------
  const {
    data: groupedData,
    isLoading: groupedLoading,
    error: groupedError,
    refetch: refetchGrouped
  } = useQuery(
    ['leaderboard', 'grouped', searchId],
    () => fetchLeaderboard(searchId, true),
    {
      keepPreviousData: true,
      onError: (err) => {
        if (isIndexingError(err)) {
          setIndexingInProgress(true);
        }
      },
      onSuccess: () => {
        setIndexingInProgress(false);
      }
    }
  );

  // ----------------- Autocomplete -------------------
  useEffect(() => {
    if (!searchTerm) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let active = true;
    fetchAutocomplete(searchTerm)
      .then((results) => {
        if (!active) return;
        setSuggestions(results);
        setShowSuggestions(true);
        setIndexingInProgress(false);
      })
      .catch((err) => {
        if (isIndexingError(err)) {
          setIndexingInProgress(true);
        }
        console.error('Autocomplete error:', err);
      });

    return () => {
      active = false;
    };
  }, [searchTerm]);

  // ----------------- Handlers -------------------
  function handleSelectSuggestion(item: AutoCompleteItem) {
    setSearchTerm(item.name);
    setSearchId(String(item.id));
    setShowSuggestions(false);
  }

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFoundRank(null);
    setHighlightedPlayerId(null);

    if (!searchId) {
      if (/^\d+$/.test(searchTerm)) {
        setSearchId(searchTerm);
      } else {
        // Try an autocomplete call
        fetchAutocomplete(searchTerm)
          .then((auto) => {
            if (auto.length > 0) {
              setSearchId(String(auto[0].id));
            } else {
              setSearchId('');
            }
          })
          .catch((err) => {
            if (isIndexingError(err)) {
              setIndexingInProgress(true);
            }
            console.error('Search error:', err);
          });
      }
    }
  }

  function handleClear() {
    setSearchTerm('');
    setSearchId('');
    setFoundRank(null);
    setHighlightedPlayerId(null);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleGroupToggle() {
    setIsGrouped(!isGrouped);
  }

  function handleCollapseAll() {
    document.querySelectorAll('details').forEach((d) => {
      (d as HTMLDetailsElement).open = false;
    });
  }

  function handleUncollapseAll() {
    document.querySelectorAll('details').forEach((d) => {
      (d as HTMLDetailsElement).open = true;
    });
  }

  // ----------------- Data to Render -------------------
  const dataToRender: Player[] = isGrouped
    ? (groupedData ?? [])
    : (normalData ?? []);

  // ----------------- Highlighting -------------------
  useEffect(() => {
    if (!dataToRender || dataToRender.length === 0) return;

    const numericId = parseInt(searchId, 10);
    if (!numericId) return;

    const foundPlayer = dataToRender.find((p) => p.id === numericId);
    if (foundPlayer) {
      setFoundRank(foundPlayer.rank ?? null);
      setHighlightedPlayerId(foundPlayer.id);

      const rowEl = document.getElementById(`player-row-${foundPlayer.id}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setFoundRank(null);
      setHighlightedPlayerId(null);
    }
  }, [dataToRender, searchId]);

  // ----------------- Render Logic -------------------

  // (1) Indexing => 503 almışız => "We are indexing..."
  if (indexingInProgress) {
    return <Message>We are indexing data. Please try later.</Message>;
  }

  // (2) Loading -> either normal or grouped
  const relevantLoading = isGrouped ? groupedLoading : normalLoading;
  if (relevantLoading) {
    return <Message>Loading...</Message>;
  }

  // (3) Error -> If there's another error (not indexingInProgress)
  const relevantError = isGrouped ? groupedError : normalError;
  if (relevantError) {
    return <Message>{(relevantError as Error).message}</Message>;
  }

  // (4) Final -> all good, render the table
  const rankMessage = foundRank ? `${searchTerm}'s rank #${foundRank}` : '';

  return (
    <MainContainer>
      <HeaderArea>
        <Logo href="https://www.panteon.games/tr/" target="_blank" rel="noopener noreferrer">
          <Image src="/logo.png" alt="PANTEON" width={150} height={60} />
        </Logo>
        <LeaderboardTitle>
          {isGrouped ? 'Leaderboard (Top 10 Each Country)' : 'Leaderboard'}
        </LeaderboardTitle>
      </HeaderArea>

      <LeaderboardSearchBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        onSelectSuggestion={handleSelectSuggestion}
        onSearch={handleSearch}
        onClear={handleClear}
        onGroupToggle={handleGroupToggle}
        isGrouped={isGrouped}
      />

      {rankMessage && <RankInfo>{rankMessage}</RankInfo>}

      <LeaderboardTable
        data={dataToRender}
        isGrouped={isGrouped}
        highlightedPlayerId={highlightedPlayerId ?? undefined}
        onCollapseAll={handleCollapseAll}
        onUncollapseAll={handleUncollapseAll}
      />
    </MainContainer>
  );
}
