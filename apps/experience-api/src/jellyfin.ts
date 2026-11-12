import { BadGatewayException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

type JsonObject = Record<string, unknown>;

export interface MediaSummary {
  id: string;
  jellyfinItemId: string;
  type: 'movie' | 'series' | 'episode';
  title: string;
  year?: number;
  overview?: string;
  progressPercent?: number;
  isFavorite: boolean;
  isPlayable: boolean;
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function summary(value: unknown): MediaSummary {
  if (!object(value) || typeof value.Id !== 'string' || typeof value.Name !== 'string' ||
      !['Movie', 'Series', 'Episode'].includes(String(value.Type))) {
    throw new BadGatewayException('Jellyfin returned an invalid media item');
  }
  if (!object(value.UserData) || typeof value.UserData.IsFavorite !== 'boolean') {
    throw new BadGatewayException('Jellyfin returned incomplete user data');
  }
  const data = value.UserData;
  const type = value.Type === 'Movie' ? 'movie' : value.Type === 'Series' ? 'series' : 'episode';
  const result: MediaSummary = {
    id: value.Id, jellyfinItemId: value.Id, type, title: value.Name,
    isFavorite: data.IsFavorite === true,
    isPlayable: type !== 'series' && Array.isArray(value.MediaSources) && value.MediaSources.length > 0,
  };
  if (typeof value.ProductionYear === 'number') result.year = value.ProductionYear;
  if (typeof value.Overview === 'string') result.overview = value.Overview;
  if (typeof data.PlayedPercentage === 'number' && data.PlayedPercentage >= 0 && data.PlayedPercentage <= 100) {
    result.progressPercent = data.PlayedPercentage;
  }
  return result;
}

export class Jellyfin {
  private readonly base: URL | null;
  private readonly key: string | undefined;
  private readonly user: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.key = env.JELLYFIN_API_KEY;
    this.user = env.JELLYFIN_HOUSEHOLD_USER_ID;
    if (!env.JELLYFIN_BASE_URL) {
      this.base = null;
    } else {
      const base = new URL(env.JELLYFIN_BASE_URL);
      if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
        throw new Error('Invalid JELLYFIN_BASE_URL');
      }
      if (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
        throw new Error('Jellyfin requires HTTPS unless it is on loopback');
      }
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      this.base = base;
    }
  }

  configured(): boolean {
    return Boolean(this.base && this.key && this.user);
  }

  private async request(path: string, params: Record<string, string> = {}, method = 'GET'): Promise<unknown> {
    if (!this.base || !this.key || !this.user) throw new ServiceUnavailableException('Jellyfin is not configured');
    const url = new URL(path, this.base);
    for (const [name, value] of Object.entries({ userId: this.user, ...params })) url.searchParams.set(name, value);
    let response: Response;
    try {
      response = await fetch(url, {
        method, headers: { 'X-Emby-Token': this.key, Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ServiceUnavailableException('Jellyfin is unreachable');
    }
    if (response.status === 404) throw new NotFoundException('Media item not found');
    if (!response.ok) throw new BadGatewayException('Jellyfin request failed');
    if (response.status === 204) return null;
    if (!response.body) throw new BadGatewayException('Jellyfin returned an empty response');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new BadGatewayException('Jellyfin response is too large');
        }
        chunks.push(part.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new BadGatewayException('Jellyfin returned an invalid or oversized response');
    }
  }

  async list(type: string, extra: Record<string, string> = {}): Promise<MediaSummary[]> {
    const value = await this.request('Items', {
      recursive: 'true', includeItemTypes: type, fields: 'Overview,MediaSources',
      enableUserData: 'true', limit: '100', ...extra,
    });
    if (!object(value) || !Array.isArray(value.Items)) throw new BadGatewayException('Jellyfin returned an invalid item list');
    return value.Items.map(summary);
  }

  async item(id: string): Promise<MediaSummary> {
    const value = await this.request(`Items/${encodeURIComponent(id)}`, { fields: 'Overview,MediaSources' });
    return summary(value);
  }

  async episodes(id: string): Promise<{ id: string | null; name: string | null; number: number | null; episodes: MediaSummary[] }[]> {
    const value = await this.request(`Shows/${encodeURIComponent(id)}/Episodes`, { fields: 'Overview,MediaSources' });
    if (!object(value) || !Array.isArray(value.Items)) throw new BadGatewayException('Jellyfin returned an invalid episode list');
    const seasons = new Map<string | null, { id: string | null; name: string | null; number: number | null; episodes: MediaSummary[] }>();
    for (const raw of value.Items) {
      if (!object(raw)) throw new BadGatewayException('Jellyfin returned an invalid episode');
      const seasonId = typeof raw.SeasonId === 'string' ? raw.SeasonId : null;
      const name = typeof raw.SeasonName === 'string' ? raw.SeasonName : null;
      const number = typeof raw.ParentIndexNumber === 'number' ? raw.ParentIndexNumber : null;
      const key = seasonId ?? (number === null ? null : `number:${number}`);
      let season = seasons.get(key);
      if (!season) {
        season = { id: seasonId, name, number, episodes: [] };
        seasons.set(key, season);
      }
      season.episodes.push(summary(raw));
    }
    return [...seasons.values()];
  }

  async similar(id: string): Promise<MediaSummary[]> {
    const value = await this.request(`Items/${encodeURIComponent(id)}/Similar`, { fields: 'Overview,MediaSources', limit: '20' });
    if (!object(value) || !Array.isArray(value.Items)) throw new BadGatewayException('Jellyfin returned an invalid item list');
    return value.Items.map(summary);
  }

  async favorite(id: string, favorite: boolean): Promise<void> {
    await this.request(`UserFavoriteItems/${encodeURIComponent(id)}`, {}, favorite ? 'POST' : 'DELETE');
  }
}
