# Game Leaderboard System

A high-performance leaderboard system designed to handle 10 million active players, featuring real-time rankings, weekly rewards, and country-based grouping.

## Features

- **High-Performance Leaderboard**
  - Handles 10M+ active players
  - Real-time ranking updates
  - Efficient Redis-based caching
  - PostgreSQL for player profiles
  - Weekly automated rewards distribution

- **Advanced Search & Display**
  - Player name autocomplete
  - Country-based grouping
  - Drag-and-drop column reordering
  - Responsive design (PC & Mobile)
  - Smart ranking window (top 100 + player context)

- **Weekly Reward System**
  - 2% total pool collection
  - Tiered distribution:
    - 1st place: 20% of pool
    - 2nd place: 15% of pool
    - 3rd place: 10% of pool
    - Remaining 55%: Distributed among ranks 4-100

## Technology Stack

### Backend
- Node.js + Express
- TypeScript
- PostgreSQL (player profiles)
- Redis (leaderboard rankings)
- node-cron (scheduled tasks)

### Frontend
- Next.js
- TypeScript
- React Query
- Styled Components
- Drag-and-Drop functionality

## Prerequisites

- Node.js 16+
- PostgreSQL 12+
- Redis 6+
- Docker (optional, for containerization)

## Installation

1. **Clone the repository**
```bash
git clone [repository-url]
cd leaderboard-system
```

2. **Set up environment variables**

Create `.env` files in both backend and frontend directories:

Backend `.env`:
```
PORT=5000
DATABASE_URL=postgresql://admin:admin@localhost:5432/leaderboard
REDIS_URL=redis://localhost:6379
```

Frontend `.env`:
```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

3. **Install dependencies**

Backend:
```bash
cd backend
npm install
```

Frontend:
```bash
cd frontend
npm install
```

4. **Initialize the database**

```bash
# Run PostgreSQL and Redis
docker-compose up -d

# Generate test data
npm run seed
```

## Running the Application

1. **Start the backend server**
```bash
cd backend
npm run dev
```

2. **Start the frontend development server**
```bash
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## API Endpoints

### GET /api/leaderboard
Returns leaderboard data with two modes:
- Normal mode: Top 100 players + context window
- Grouped mode: Top 10 players per country

Query Parameters:
- `playerId` (optional): Show context for specific player
- `group` (optional): Enable country grouping

### GET /api/players/autocomplete
Player name search with autocomplete.

Query Parameters:
- `q`: Search query string

## Architecture Details

### Data Flow
1. Player data stored in PostgreSQL
2. Rankings maintained in Redis sorted set
3. Frontend queries via React Query
4. Weekly rewards processed via cron job

### Performance Optimizations
- Batched database operations
- Redis caching for rankings
- Chunked data loading
- Efficient pagination
- Trigram index for search

### Concurrency Handling
- Atomic Redis operations
- Database transaction safety
- Rate limiting
- Concurrent request management

## Deployment

The system is designed to be deployed as separate services:

1. **Database Layer**
   - PostgreSQL for persistent storage
   - Redis for caching and rankings

2. **Backend API**
   - Node.js application
   - Scalable horizontally
   - Stateless design

3. **Frontend**
   - Static Next.js build
   - CDN-friendly
   - Responsive design

## Development Notes

### Database Indices
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_players_name_trgm ON public.players USING gin (name gin_trgm_ops);
```

### Redis Keys
- `leaderboard`: Sorted set of player rankings
- `leaderboard:init_done`: Initialization flag
- `leaderboard:last_known_id`: Latest processed player ID
- `leaderboard:sync_offset`: Sync progress tracker

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Testing

The application includes comprehensive tests for both frontend and backend:

```bash
# Backend tests
cd backend
npm run test

# Frontend tests
cd frontend
npm run test
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
