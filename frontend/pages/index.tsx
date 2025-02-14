/* frontend/pages/index.tsx */
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useQuery } from 'react-query';
import styled from 'styled-components';
import DragDropColumns from '../components/DragDropColumns';

// Types
type Player = {
  id: number;
  name: string;
  country: string;
  money: number;
  rank: number | null;
};
type AutoCompleteItem = {
  id: number;
  name: string;
};

// fetchLeaderboard => ?playerId=..., ?group=1 => normal or grouped
async function fetchLeaderboard(playerId?: string, group?: boolean): Promise<Player[]> {
  let url = 'http://localhost:5000/api/leaderboard';
  const params = new URLSearchParams();
  if (playerId) params.set('playerId', playerId);
  if (group) params.set('group', '1');
  const queryString = params.toString();
  if (queryString) url += `?${queryString}`;

  const res = await fetch(url);
  // 503 => indexingInProgress
  if (res.status === 503) {
    const data = await res.json();
    throw new Error(data.message || 'Indexing in progress');
  }
  if (!res.ok) return [];
  return res.json();
}

// fetchAutocomplete => /players/autocomplete?q=...
async function fetchAutocomplete(query: string): Promise<AutoCompleteItem[]> {
  if (!query) return [];
  const url = `http://localhost:5000/api/players/autocomplete?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (res.status === 503) {
    // "IndexingInProgress"
    const data = await res.json();
    throw new Error(data.message || 'Indexing in progress');
  }
  if (!res.ok) throw new Error('Autocomplete error');
  return res.json();
}

export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchId, setSearchId] = useState('');
  const [suggestions, setSuggestions] = useState<AutoCompleteItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGrouped, setIsGrouped] = useState(false);

  // highlight & rank
  const [foundRank, setFoundRank] = useState<number | null>(null);
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<number | null>(null);

  // Extra: groupLoading => butona basınca "Loading..." göstereceğiz.
  const [groupLoading, setGroupLoading] = useState(false);

  // Additional: indexingInProgress => sunucu 503 dönerse
  const [indexingInProgress, setIndexingInProgress] = useState(false);

  // useQuery => call fetchLeaderboard
  const { data, isLoading, error, refetch } = useQuery(
    ['leaderboard', searchId, isGrouped],
    async () => {
      try {
        const d = await fetchLeaderboard(searchId, isGrouped);
        setIndexingInProgress(false); 
        return d;
      } catch (err: any) {
        if (err.message.includes('Indexing in progress')) {
          setIndexingInProgress(true);
        }
        throw err;
      }
    },
    { keepPreviousData: true }
  );

  // Autocomplete effect
  useEffect(() => {
    let active = true;
    if (!searchTerm) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    fetchAutocomplete(searchTerm)
      .then((results) => {
        if (active) {
          setSuggestions(results);
          setShowSuggestions(true);
        }
      })
      .catch((err) => {
        // eğer "Indexing in progress" ise => setIndexingInProgress(true)
        if (err.message.includes('Indexing in progress')) {
          setIndexingInProgress(true);
        }
        console.error('autocomplete error:', err);
      });

    return () => { active = false; };
  }, [searchTerm]);

  // Suggestion seçilince
  function handleSelectSuggestion(item: AutoCompleteItem) {
    setSearchTerm(item.name);
    setSearchId(String(item.id));
    setShowSuggestions(false);
  }

  // Search butonu
  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFoundRank(null);
    setHighlightedPlayerId(null);

    if (!searchId) {
      // Numeric ID mi?
      if (/^\d+$/.test(searchTerm)) {
        setSearchId(searchTerm);
        refetch();
      } else {
        // Name => fetchAutocomplete
        fetchAutocomplete(searchTerm)
          .then((auto) => {
            if (auto.length > 0) {
              setSearchId(String(auto[0].id));
            } else {
              setSearchId('');
            }
            refetch();
          })
          .catch((err) => {
            console.error('search error:', err);
          });
      }
    } else {
      refetch();
    }
  }

  // Clear
  function handleClear() {
    setSearchTerm('');
    setSearchId('');
    setFoundRank(null);
    setHighlightedPlayerId(null);
    setSuggestions([]);
    setShowSuggestions(false);
    refetch();
  }

  // Group button
  async function handleGroupToggle() {
    if (!isGrouped) {
      setGroupLoading(true);    
      setIsGrouped(true);
      refetch();               
    } else {
      setIsGrouped(false);
      refetch();
    }
  }

  // data değiştiğinde groupLoading false
  useEffect(() => {
    if (!isLoading) {
      setGroupLoading(false);
    }
  }, [isLoading]);

  // data değişince highlight
  useEffect(() => {
    if (!data || data.length === 0) return;
    const pid = Number(searchId);
    if (!pid) return;

    const found = data.find((p) => p.id === pid);
    if (found) {
      setFoundRank(found.rank);
      setHighlightedPlayerId(found.id);
      const rowEl = document.getElementById(`player-row-${found.id}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setFoundRank(null);
      setHighlightedPlayerId(null);
    }
  }, [data, searchId]);

  // collapse all, uncollapse all
  function handleCollapseAll() {
    const detailsList = document.querySelectorAll('details');
    detailsList.forEach((d) => {
      (d as HTMLDetailsElement).open = false;
    });
  }
  function handleUncollapseAll() {
    const detailsList = document.querySelectorAll('details');
    detailsList.forEach((d) => {
      (d as HTMLDetailsElement).open = true;
    });
  }

  // 1) indexingInProgress => "We are indexing" 
  if (indexingInProgress) {
    return (
      <MainContainer>
        <Message>We are indexing data, please try later.</Message>
      </MainContainer>
    );
  }

  // 2) global loading
  if (isLoading) {
    return <Message>Loading...</Message>;
  }

  // 3) error
  if (error) {
    return <Message>{(error as Error).message}</Message>;
  }

  // 4) eğer groupLoading => "Loading group data..."
  if (groupLoading) {
    return (
      <MainContainer>
        <Message>Loading group data...</Message>
      </MainContainer>
    );
  }

  // 5) data yok
  if (!data || data.length === 0) {
    return (
      <MainContainer>
        <HeaderArea>
          <Logo href="https://www.panteon.games/tr/" target="_blank" rel="noopener noreferrer">
            <Image src="/logo.png" alt="PANTEON" width={150} height={60} />
          </Logo>
          <LeaderboardTitle>Leaderboard</LeaderboardTitle>
        </HeaderArea>

        <SearchForm onSubmit={handleSearch}>
          <SearchContainer>
            <SearchInput
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <SuggestionList>
                {suggestions.map((item) => (
                  <SuggestionItem key={item.id} onClick={() => handleSelectSuggestion(item)}>
                    {item.name} (ID: {item.id})
                  </SuggestionItem>
                ))}
              </SuggestionList>
            )}
          </SearchContainer>
          <Button type="submit">Search</Button>
          <Button type="button" onClick={handleClear}>Clear</Button>
          <Button type="button" onClick={handleGroupToggle}>
            {isGrouped ? 'Ungroup' : 'Group by Country'}
          </Button>
        </SearchForm>

        <Message>No data found.</Message>
      </MainContainer>
    );
  }

  // rank info
  const rankMessage = foundRank ? `${searchTerm}'s rank #${foundRank}` : '';

  // “Group by Country” mod => her ülke top 10
  if (isGrouped) {
    const byCountry: Record<string, Player[]> = {};
    data.forEach((p) => {
      const c = p.country || 'Unknown';
      if (!byCountry[c]) byCountry[c] = [];
      byCountry[c].push(p);
    });

    return (
      <MainContainer>
        <HeaderArea>
          <Logo href="https://www.panteon.games/tr/" target="_blank" rel="noopener noreferrer">
            <Image src="/logo.png" alt="PANTEON" width={150} height={60} />
          </Logo>
          <LeaderboardTitle>Leaderboard (Top 10 each Country)</LeaderboardTitle>
        </HeaderArea>

        <SearchForm onSubmit={handleSearch}>
          <SearchContainer>
            <SearchInput
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <SuggestionList>
                {suggestions.map((item) => (
                  <SuggestionItem key={item.id} onClick={() => handleSelectSuggestion(item)}>
                    {item.name} (ID: {item.id})
                  </SuggestionItem>
                ))}
              </SuggestionList>
            )}
          </SearchContainer>
          <Button type="submit">Search</Button>
          <Button type="button" onClick={handleClear}>Clear</Button>
          <Button type="button" onClick={handleGroupToggle}>Ungroup</Button>
          <Button type="button" onClick={handleCollapseAll}>Collapse All</Button>
          <Button type="button" onClick={handleUncollapseAll}>Uncollapse All</Button>
        </SearchForm>

        {rankMessage && <RankInfo>{rankMessage}</RankInfo>}

        {Object.entries(byCountry).map(([country, players]) => (
          <details key={country} open style={{ marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '1.1rem', margin: '0.5rem 0' }}>
              {country} ({players.length} players)
            </summary>
            <DragDropColumns
              data={players}
              highlightedPlayerId={highlightedPlayerId ?? undefined}
            />
          </details>
        ))}
      </MainContainer>
    );
  }

  // Normal tablo => top100 + 3üst2alt
  return (
    <MainContainer>
      <HeaderArea>
        <Logo href="https://www.panteon.games/tr/" target="_blank" rel="noopener noreferrer">
          <Image src="/logo.png" alt="PANTEON" width={150} height={60} />
        </Logo>
        <LeaderboardTitle>Leaderboard</LeaderboardTitle>
      </HeaderArea>

      <SearchForm onSubmit={handleSearch}>
        <SearchContainer>
          <SearchInput
            type="text"
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <SuggestionList>
              {suggestions.map((item) => (
                <SuggestionItem key={item.id} onClick={() => handleSelectSuggestion(item)}>
                  {item.name} (ID: {item.id})
                </SuggestionItem>
              ))}
            </SuggestionList>
          )}
        </SearchContainer>
        <Button type="submit">Search</Button>
        <Button type="button" onClick={handleClear}>Clear</Button>
        <Button type="button" onClick={handleGroupToggle}>Group by Country</Button>
      </SearchForm>

      {rankMessage && <RankInfo>{rankMessage}</RankInfo>}

      <DragDropColumns
        data={data}
        highlightedPlayerId={highlightedPlayerId ?? undefined}
      />
    </MainContainer>
  );
}

/* ====== Styled Components ====== */

const MainContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
`;

const HeaderArea = styled.div`
  text-align: center;
  margin-bottom: 2rem;
`;

const Logo = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
`;

const LeaderboardTitle = styled.h1`
  font-size: 2.5rem;
  color: #fff;
  margin-bottom: 0;
`;

const SearchForm = styled.form`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
  align-items: center;
`;

const SearchContainer = styled.div`
  position: relative;
`;

const SearchInput = styled.input`
  width: 240px;
  padding: 0.5rem 1rem;
  border: 1px solid #3a2d5d;
  border-radius: 5px;
  background: #1d1335;
  color: #fff;
  &:focus {
    outline: 2px solid #6f52a7;
  }
`;

const Button = styled.button`
  background: #3f2b75;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  &:hover {
    background: #553693;
  }
`;

const SuggestionList = styled.ul`
  position: absolute;
  top: 42px;
  left: 0;
  width: 240px;
  max-height: 200px;
  background: #1d1335;
  border: 1px solid #3a2d5d;
  border-radius: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  z-index: 999;
`;

const SuggestionItem = styled.li`
  padding: 0.5rem 1rem;
  color: #fff;
  cursor: pointer;
  &:hover {
    background: #2a1f4a;
  }
`;

const RankInfo = styled.div`
  text-align: center;
  font-weight: bold;
  margin-bottom: 1rem;
  font-size: 1.2rem;
`;

const Message = styled.div`
  text-align: center;
  margin-top: 2rem;
  font-size: 1.2rem;
`;
