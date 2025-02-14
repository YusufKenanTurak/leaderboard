/**
 * Shared TypeScript interfaces and types used throughout the backend.
 */

export interface PlayerRow {
    id: number;
    name?: string;
    country_id?: number;
    money: number;
  }
  
  export interface PlayerJoined {
    id: number;
    name: string;
    country: string;
    money: number;
  }
  
  export interface LeaderboardEntry {
    id: string;
    score: number;
  }
  