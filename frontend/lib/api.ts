/**
 * lib/api.ts
 * Centralized API calls to the backend, reusing them across the application.
 */

export type Player = {
    id: number;
    name: string;
    country: string;
    money: number;
    rank: number | null;
  };
  
  export type AutoCompleteItem = {
    id: number;
    name: string;
  };
  
  /**
   * Fetch leaderboard data from the backend.
   * Optionally filter by playerId, and group by country if needed.
   */
  export async function fetchLeaderboard(playerId?: string, group?: boolean): Promise<Player[]> {
    let url = 'http://localhost:5000/api/leaderboard';
    const params = new URLSearchParams();
    if (playerId) params.set('playerId', playerId);
    if (group) params.set('group', '1');
    const queryString = params.toString();
  
    if (queryString) {
      url += `?${queryString}`;
    }
  
    const res = await fetch(url);
    if (res.status === 503) {
      const data = await res.json();
      throw new Error(data.message || 'Indexing in progress');
    }
    if (!res.ok) {
      return [];
    }
    return res.json();
  }
  
  /**
   * Fetch up to 10 autocomplete suggestions from the backend, matching the query.
   */
  export async function fetchAutocomplete(query: string): Promise<AutoCompleteItem[]> {
    if (!query) {
      return [];
    }
    const url = `http://localhost:5000/api/players/autocomplete?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (res.status === 503) {
      const data = await res.json();
      throw new Error(data.message || 'Indexing in progress');
    }
    if (!res.ok) {
      throw new Error('Autocomplete error');
    }
    return res.json();
  }
  