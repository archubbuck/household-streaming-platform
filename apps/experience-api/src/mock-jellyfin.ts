import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { Jellyfin } from './jellyfin.js';

type MockItem = {
  Id: string;
  Name: string;
  Type: 'Movie' | 'Series' | 'Episode';
  ProductionYear: number;
  Overview: string;
  Genres: string[];
  SeriesId?: string;
  SeasonId?: string;
  SeasonName?: string;
  ParentIndexNumber?: number;
};

const items: MockItem[] = [
  { Id: 'mock-film-1', Name: 'The Lantern Trail', Type: 'Movie', ProductionYear: 2024, Overview: 'A sample story about an unexpected journey.', Genres: ['Adventure'] },
  { Id: 'mock-film-2', Name: 'A Quiet Signal', Type: 'Movie', ProductionYear: 2022, Overview: 'A sample mystery from a fictional library.', Genres: ['Mystery'] },
  { Id: 'mock-series-1', Name: 'The Paper Observatory', Type: 'Series', ProductionYear: 2023, Overview: 'A fictional series for offline integration testing.', Genres: ['Drama'] },
  { Id: 'mock-episode-1', Name: 'First Light', Type: 'Episode', ProductionYear: 2023, Overview: 'A sample episode.', Genres: ['Drama'], SeriesId: 'mock-series-1', SeasonId: 'mock-season-1', SeasonName: 'Season 1', ParentIndexNumber: 1 },
  { Id: 'mock-episode-2', Name: 'The Long Night', Type: 'Episode', ProductionYear: 2023, Overview: 'Another sample episode.', Genres: ['Drama'], SeriesId: 'mock-series-1', SeasonId: 'mock-season-1', SeasonName: 'Season 1', ParentIndexNumber: 1 },
];

export async function createMockJellyfin() {
  const token = randomBytes(32).toString('base64url');
  const favorites = new Set<string>();
  const output = (item: MockItem) => ({
    ...item, UserData: { IsFavorite: favorites.has(item.Id), ...(item.Id === 'mock-film-1' ? { PlayedPercentage: 35 } : {}) },
    MediaSources: item.Type === 'Series' ? [] : [{ Id: 'mock-source' }],
  });
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    if (request.headers['x-emby-token'] !== token) {
      response.writeHead(401).end(JSON.stringify({ message: 'Unauthorized' }));
      return;
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);
    const item = items.find((entry) => entry.Id === parts[1]);
    if (url.pathname === '/Items' && request.method === 'GET') {
      const types = (url.searchParams.get('includeItemTypes') ?? '').split(',');
      const search = (url.searchParams.get('searchTerm') ?? '').toLowerCase();
      const genre = url.searchParams.get('genres');
      const selected = items.filter((entry) => types.includes(entry.Type) && entry.Name.toLowerCase().includes(search) &&
        (!genre || entry.Genres.some((value) => value.toLowerCase() === genre.toLowerCase())));
      const sort = url.searchParams.get('sortBy');
      if (sort === 'SortName') selected.sort((a, b) => a.Name.localeCompare(b.Name));
      if (sort === 'ProductionYear') selected.sort((a, b) => a.ProductionYear - b.ProductionYear);
      if (url.searchParams.get('sortOrder') === 'Descending') selected.reverse();
      response.end(JSON.stringify({ Items: selected.slice(0, 100).map(output) }));
      return;
    }
    if (parts[0] === 'Items' && item && request.method === 'GET') {
      if (parts.length === 2) response.end(JSON.stringify(output(item)));
      else if (parts.length === 3 && parts[2] === 'Similar') {
        response.end(JSON.stringify({ Items: items.filter((entry) => entry.Type === item.Type && entry.Id !== item.Id).map(output) }));
      } else response.writeHead(404).end('{}');
      return;
    }
    if (parts[0] === 'Shows' && item?.Type === 'Series' && parts.length === 3 && parts[2] === 'Episodes' && request.method === 'GET') {
      response.end(JSON.stringify({ Items: items.filter((entry) => entry.SeriesId === item.Id).map(output) }));
      return;
    }
    if (parts[0] === 'UserFavoriteItems' && item && parts.length === 2 && ['POST', 'DELETE'].includes(request.method ?? '')) {
      if (request.method === 'POST') favorites.add(item.Id);
      else favorites.delete(item.Id);
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404).end(JSON.stringify({ message: 'Mock route or item not found' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  server.unref();
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock Jellyfin failed to bind');
  const jellyfin = new Jellyfin({
    JELLYFIN_BASE_URL: `http://127.0.0.1:${address.port}`,
    JELLYFIN_API_KEY: token,
    JELLYFIN_HOUSEHOLD_USER_ID: 'mock-user',
  });
  return { jellyfin, server };
}

export function jellyfinMode(env: NodeJS.ProcessEnv): 'mock' | 'live' {
  const mode = env.HOUSEHOLD_JELLYFIN_MODE ?? 'mock';
  if (mode !== 'live' && mode !== 'mock') throw new Error('HOUSEHOLD_JELLYFIN_MODE must be live or mock');
  if (mode === 'mock' && [env.JELLYFIN_BASE_URL, env.JELLYFIN_API_KEY, env.JELLYFIN_HOUSEHOLD_USER_ID].some(Boolean)) {
    throw new Error('Mock mode cannot be combined with Jellyfin configuration; set HOUSEHOLD_JELLYFIN_MODE=live to use a real server');
  }
  return mode;
}
