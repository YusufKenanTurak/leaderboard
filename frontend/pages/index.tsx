// frontend/pages/index.tsx

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

/** Tek endpoint, group=1 => her ülkenin top 10 */
async function fetchLeaderboard(playerId?: string, group?: boolean): Promise<Player[]> {
  let url = 'http://localhost:5000/api/leaderboard';
  const params = new URLSearchParams();
  if (playerId) {
    params.set('playerId', playerId);
  }
  if (group) {
    params.set('group', '1');  // ?group=1 
  }
  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  return res.json();
}

async function fetchAutocomplete(q: string): Promise<AutoCompleteItem[]> {
  if (!q) return [];
  const url = `http://localhost:5000/api/players/autocomplete?q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Autocomplete error');
  }
  return res.json();
}

export default function HomePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchId, setSearchId] = useState('');
  const [suggestions, setSuggestions] = useState<AutoCompleteItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGrouped, setIsGrouped] = useState(false);

  const [foundRank, setFoundRank] = useState<number | null>(null);
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<number | null>(null);

  // useQuery => key: ['leaderboard', searchId, isGrouped]
  // => fetchLeaderboard(searchId, isGrouped)
  const { data, isLoading, error, refetch } = useQuery(
    ['leaderboard', searchId, isGrouped],
    () => fetchLeaderboard(searchId, isGrouped),
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
      .catch((err) => console.error('Autocomplete fetch error:', err));
    return () => { active = false; };
  }, [searchTerm]);

  function handleSelectSuggestion(item: AutoCompleteItem) {
    setSearchTerm(item.name);
    setSearchId(String(item.id));
    setShowSuggestions(false);
  }

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFoundRank(null);
    setHighlightedPlayerId(null);

    if (!searchId) {
      if (/^\d+$/.test(searchTerm)) {
        setSearchId(searchTerm);
        refetch();
      } else {
        const auto = await fetchAutocomplete(searchTerm);
        if (auto.length > 0) {
          setSearchId(String(auto[0].id));
        } else {
          setSearchId('');
        }
      }
    }
    refetch();
  }

  function handleClear() {
    setSearchTerm('');
    setSearchId('');
    setFoundRank(null);
    setHighlightedPlayerId(null);
    setSuggestions([]);
    setShowSuggestions(false);
    refetch();
  }

  // data geldikten sonra highlight logic
  useEffect(() => {
    if (!data || data.length === 0) return;
    const pid = Number(searchId);
    if (!pid) return;
    const found = data.find((p) => p.id === pid);
    if (found) {
      setFoundRank(found.rank);
      setHighlightedPlayerId(found.id);
      const rowEl = document.getElementById(`player-row-${found.id}`);
      if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setFoundRank(null);
      setHighlightedPlayerId(null);
    }
  }, [data, searchId]);

  // Render 
  if (isLoading) return <Message>Loading...</Message>;
  if (error) return <Message>{(error as Error).message}</Message>;

  if (!data || data.length === 0) {
    return (
      <MainContainer>
        <HeaderArea>
          <Logo
            href="https://www.panteon.games/tr/"
            target="_blank"
            rel="noopener noreferrer"
          >
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
                  <SuggestionItem 
                    key={item.id}
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    {item.name} (ID: {item.id})
                  </SuggestionItem>
                ))}
              </SuggestionList>
            )}
          </SearchContainer>
          <Button type="submit">Search</Button>
          <Button type="button" onClick={handleClear}>Clear</Button>
          <Button type="button" onClick={() => setIsGrouped(!isGrouped)}>
            {isGrouped ? 'Ungroup' : 'Group by Country'}
          </Button>
        </SearchForm>

        <Message>No data found.</Message>
      </MainContainer>
    );
  }

  const rankMessage = foundRank ? `${searchTerm}'s rank #${foundRank}` : '';

  // GROUP BY => data her ülkeye top 10
  if (isGrouped) {
    // data zaten "her ülke top10" şeklinde geliyor 
    // rank => 1..10
    // Yine de front-end’de grouping ile country altına koyuyoruz
    const byCountry: Record<string, Player[]> = {};
    data.forEach((p) => {
      const c = p.country || 'Unknown';
      if (!byCountry[c]) byCountry[c] = [];
      byCountry[c].push(p);
    });

    return (
      <MainContainer>
        <HeaderArea>
          <Logo
            href="https://www.panteon.games/tr/"
            target="_blank"
            rel="noopener noreferrer"
          >
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
                  <SuggestionItem 
                    key={item.id}
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    {item.name} (ID: {item.id})
                  </SuggestionItem>
                ))}
              </SuggestionList>
            )}
          </SearchContainer>
          <Button type="submit">Search</Button>
          <Button type="button" onClick={handleClear}>Clear</Button>
          <Button type="button" onClick={() => setIsGrouped(false)}>
            Ungroup
          </Button>
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
        <Logo
          href="https://www.panteon.games/tr/"
          target="_blank"
          rel="noopener noreferrer"
        >
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
                <SuggestionItem
                  key={item.id}
                  onClick={() => handleSelectSuggestion(item)}
                >
                  {item.name} (ID: {item.id})
                </SuggestionItem>
              ))}
            </SuggestionList>
          )}
        </SearchContainer>
        <Button type="submit">Search</Button>
        <Button type="button" onClick={handleClear}>Clear</Button>
        <Button type="button" onClick={() => setIsGrouped(true)}>
          Group by Country
        </Button>
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
