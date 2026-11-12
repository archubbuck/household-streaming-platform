import {
  Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, HttpException,
  Inject, Injectable, Module, Param, Post, Query, UnauthorizedException, UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeviceStore } from './devices.js';
import { Jellyfin } from './jellyfin.js';
import { fixtureCatalog } from './preview-fixtures.js';

const DEVICES = Symbol('devices');
const JELLYFIN = Symbol('jellyfin');
const SOURCE = Symbol('catalog-source');

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function id(value: string): string {
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(value)) throw new BadRequestException('Invalid item ID');
  return value;
}

function unavailable(): never {
  throw new HttpException('Playback is not implemented', 501);
}

function browseOptions(query: unknown): Record<string, string> {
  if (!isRecord(query) || Object.keys(query).some((key) => !['genre', 'sort', 'order'].includes(key))) {
    throw new BadRequestException('Invalid browse options');
  }
  const params: Record<string, string> = {};
  if (query.genre !== undefined) {
    if (typeof query.genre !== 'string' || !query.genre.trim() || query.genre.length > 100) throw new BadRequestException('Invalid genre');
    params.genres = query.genre.trim();
  }
  if (query.sort !== undefined) {
    if (typeof query.sort !== 'string' || !['SortName', 'DateCreated', 'ProductionYear'].includes(query.sort)) throw new BadRequestException('Invalid sort');
    params.sortBy = query.sort;
  }
  if (query.order !== undefined) {
    if (typeof query.order !== 'string' || !['Ascending', 'Descending'].includes(query.order)) throw new BadRequestException('Invalid order');
    params.sortOrder = query.order;
  }
  return params;
}

@Injectable()
class DeviceGuard implements CanActivate {
  constructor(@Inject(DEVICES) private readonly devices: DeviceStore) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '');
    if (!match || !this.devices.authorize(match[1])) throw new UnauthorizedException();
    return true;
  }
}

@ApiTags('health')
@Controller('v1')
class PublicController {
  constructor(@Inject(DEVICES) private readonly devices: DeviceStore, @Inject(JELLYFIN) private readonly jellyfin: Jellyfin,
    @Inject(SOURCE) private readonly source: 'live' | 'mock') {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness and configuration status, not an upstream connectivity check' })
  health() {
    return { status: 'ok', jellyfinConfigured: this.jellyfin.configured(), jellyfinConnectivity: 'not_checked', catalogSource: this.source };
  }

  @Get('preview/catalog')
  @ApiOperation({ summary: 'Unpaired sample data for the local browser preview' })
  previewCatalog() {
    return { source: 'fixture', ...fixtureCatalog() };
  }

  @Post('devices/pair')
  @HttpCode(200)
  @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['code'], properties: { code: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } } } })
  @ApiResponse({ status: 200, description: 'One-time device credential' })
  pair(@Body() body: unknown) {
    if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.code)) {
      throw new BadRequestException('Expected a pairing code');
    }
    const device = this.devices.pair(body.code);
    if (!device) throw new UnauthorizedException('Invalid or expired pairing code');
    return device;
  }
}

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(DeviceGuard)
@Controller('v1')
class CatalogController {
  constructor(@Inject(JELLYFIN) private readonly jellyfin: Jellyfin) {}

  @Get('home')
  async home() {
    const items = (await this.jellyfin.list('Movie', { sortBy: 'DateCreated', sortOrder: 'Descending' })).filter((item) => item.isPlayable);
    return { featured: items[0] ?? null, rows: [{ id: 'recent', title: 'Recently added', layout: 'poster', items }], generatedAt: new Date().toISOString() };
  }

  @Get('catalog/movies')
  movies(@Query() query: unknown) { return this.jellyfin.list('Movie', browseOptions(query)); }

  @Get('catalog/series')
  series(@Query() query: unknown) { return this.jellyfin.list('Series', browseOptions(query)); }

  @Get('catalog/search')
  search(@Query('q') query: unknown) {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new BadRequestException('A search query is required');
    return this.jellyfin.list('Movie,Episode', { searchTerm: query.trim() }).then((items) => items.filter((item) => item.isPlayable));
  }

  @Get('catalog/:id')
  async details(@Param('id') itemId: string) {
    const validId = id(itemId);
    const [item, related] = await Promise.all([this.jellyfin.item(validId), this.jellyfin.similar(validId)]);
    return { item, related };
  }

  @Get('series/:id/episodes')
  async episodes(@Param('id') seriesId: string) {
    return { seasons: await this.jellyfin.episodes(id(seriesId)) };
  }

  @Post('household/favorites')
  @HttpCode(204)
  @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['id', 'favorite'], properties: { id: { type: 'string' }, favorite: { type: 'boolean' } } } })
  async favorite(@Body() body: unknown) {
    if (!isRecord(body) || Object.keys(body).length !== 2 || typeof body.id !== 'string' || typeof body.favorite !== 'boolean') {
      throw new BadRequestException('Expected id and favorite');
    }
    await this.jellyfin.favorite(id(body.id), body.favorite);
  }

  @Post('playback/sessions')
  session() { return unavailable(); }

  @Post('playback/:id/progress')
  progress() { return unavailable(); }

  @Post('playback/:id/stop')
  stop() { return unavailable(); }
}

export function appModule(devices: DeviceStore, jellyfin: Jellyfin, source: 'live' | 'mock' = 'live', shutdown?: () => Promise<void>) {
  @Module({
    controllers: [PublicController, CatalogController],
    providers: [
      DeviceGuard, { provide: DEVICES, useValue: devices }, { provide: JELLYFIN, useValue: jellyfin },
      { provide: SOURCE, useValue: source }, { provide: 'upstream-lifecycle', useValue: { onApplicationShutdown: shutdown ?? (() => {}) } },
    ],
  })
  class AppModule {}
  return AppModule;
}
