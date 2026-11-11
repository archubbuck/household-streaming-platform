import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { appModule } from './app.js';
import { DeviceStore } from './devices.js';
import { Jellyfin } from './jellyfin.js';
import { createMockJellyfin, jellyfinMode } from './mock-jellyfin.js';

test('pairing is expiring, single-use, durable and revocable', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'household-device-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'devices.sqlite');
  const store = new DeviceStore(file);
  const expired = store.createPairingCode(1);
  assert.equal(store.pair(expired, 300001), null);
  const code = store.createPairingCode(500000);
  const pair = store.pair(code, 500001);
  assert.ok(pair);
  assert.equal(store.pair(code, 500002), null);
  assert.equal(store.authorize(pair.credential), true);
  store.close();
  const reopened = new DeviceStore(file);
  assert.equal(reopened.authorize(pair.credential), true);
  assert.equal(reopened.revoke(pair.deviceId), true);
  assert.equal(reopened.authorize(pair.credential), false);
  assert.equal(reopened.revoke(pair.deviceId), false);
  reopened.close();
});

test('device storage rejects insecure POSIX directory and database permissions', { skip: process.platform === 'win32' }, (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'household-device-permission-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  chmodSync(directory, 0o755);
  assert.throws(() => new DeviceStore(join(directory, 'devices.sqlite')), /directory must be private/);
  chmodSync(directory, 0o700);
  const file = join(directory, 'devices.sqlite');
  const store = new DeviceStore(file);
  store.close();
  chmodSync(file, 0o644);
  assert.throws(() => new DeviceStore(file), /database must be a private/);
});

test('default database is created on server launch and shared with the device CLI', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'household-api-home-'));
  const env = {
    ...process.env, HOME: home, USERPROFILE: home,
    HOUSEHOLD_DEVICE_DB: join(home, 'ignored.sqlite'),
    HOUSEHOLD_JELLYFIN_MODE: 'live',
    JELLYFIN_BASE_URL: '', JELLYFIN_API_KEY: '', JELLYFIN_HOUSEHOLD_USER_ID: '',
  };
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const main = fileURLToPath(new URL('./main.js', import.meta.url));
  const cli = fileURLToPath(new URL('./device-cli.js', import.meta.url));
  const start = () => {
    const processHandle = spawn(process.execPath, [main], { env: { ...env, HOUSEHOLD_API_PORT: String(port) }, stdio: 'ignore' });
    const exited = new Promise<void>((resolve) => processHandle.once('exit', () => resolve()));
    return { processHandle, exited };
  };
  let running = start();
  const stop = async () => {
    if (running.processHandle.exitCode === null && running.processHandle.signalCode === null) {
      running.processHandle.kill();
      await running.exited;
    }
  };
  t.after(async () => {
    await stop();
    rmSync(home, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const waitForReady = async () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (running.processHandle.exitCode !== null || running.processHandle.signalCode !== null) break;
      try {
        if ((await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(200) })).ok) return;
      } catch {
        // Wait for the loopback server to start.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail('API did not start');
  };
  await waitForReady();
  const directory = join(home, '.household-streaming');
  const file = join(directory, 'devices.sqlite');
  assert.ok(existsSync(file));
  assert.equal(existsSync(join(home, 'ignored.sqlite')), false);
  if (process.platform !== 'win32') {
    assert.equal(lstatSync(directory).mode & 0o077, 0);
    assert.equal(lstatSync(file).mode & 0o077, 0);
  }
  const initial = new DatabaseSync(file, { readOnly: true });
  assert.equal(initial.prepare('SELECT count(*) AS count FROM devices').get()?.count, 0);
  assert.equal(initial.prepare('SELECT count(*) AS count FROM pairing_codes').get()?.count, 0);
  initial.close();
  const code = execFileSync(process.execPath, [cli, 'pair-code'], { env, encoding: 'utf8' }).trim();
  const response = await fetch(`${url}/v1/devices/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
  });
  assert.equal(response.status, 200);
  const pair = await response.json() as { deviceId: string; credential: string };
  await stop();
  running = start();
  await waitForReady();
  const authHeaders = { authorization: `Bearer ${pair.credential}` };
  assert.equal((await fetch(`${url}/v1/home`, { headers: authHeaders })).status, 503);
  assert.equal(execFileSync(process.execPath, [cli, 'revoke', pair.deviceId], { env, encoding: 'utf8' }).trim(), 'Device revoked.');
  assert.equal((await fetch(`${url}/v1/home`, { headers: authHeaders })).status, 401);
  const reopened = new DeviceStore(file);
  assert.equal(reopened.authorize(pair.credential), false);
  reopened.close();
});

test('default database initialization rejects an existing symlinked directory', { skip: process.platform === 'win32' }, (t) => {
  const home = mkdtempSync(join(tmpdir(), 'household-api-link-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(tmpdir(), join(home, '.household-streaming'), 'dir');
  const cli = fileURLToPath(new URL('./device-cli.js', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [cli, 'pair-code'], {
    env: { ...process.env, HOME: home }, stdio: 'pipe',
  }));
});

test('API process defaults to mock mode and serves paired catalog requests', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'household-mock-home-'));
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const env = {
    ...process.env, HOME: home, USERPROFILE: home,
    HOUSEHOLD_JELLYFIN_MODE: undefined, HOUSEHOLD_API_PORT: String(address.port),
    JELLYFIN_BASE_URL: '', JELLYFIN_API_KEY: '', JELLYFIN_HOUSEHOLD_USER_ID: '',
  };
  const main = fileURLToPath(new URL('./main.js', import.meta.url));
  const cli = fileURLToPath(new URL('./device-cli.js', import.meta.url));
  const child = spawn(process.execPath, [main], { env, stdio: 'ignore' });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    rmSync(home, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${address.port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    try {
      const response = await fetch(`${base}/v1/health`, { signal: AbortSignal.timeout(200) });
      if (response.ok) {
        const health = await response.json() as { catalogSource: string };
        assert.equal(health.catalogSource, 'mock');
        ready = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.equal(ready, true, 'Mock API did not start');
  const code = execFileSync(process.execPath, [cli, 'pair-code'], { env, encoding: 'utf8' }).trim();
  const paired = await fetch(`${base}/v1/devices/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
  });
  assert.equal(paired.status, 200);
  const device = await paired.json() as { credential: string };
  const catalog = await fetch(`${base}/v1/catalog/movies`, { headers: { authorization: `Bearer ${device.credential}` } });
  assert.equal(catalog.status, 200);
  const movies = await catalog.json() as { id: string }[];
  assert.equal(movies[0].id, 'mock-film-1');
});

test('HTTP routes enforce pairing, validate inputs and fail closed without Jellyfin', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'household-api-test-'));
  const store = new DeviceStore(join(directory, 'devices.sqlite'));
  const app = await NestFactory.create(appModule(store, new Jellyfin({})), { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = await app.getUrl();
  assert.equal((await fetch(`${base}/v1/health`)).status, 200);
  const preview = await fetch(`${base}/v1/preview/catalog`);
  assert.equal(preview.status, 200);
  const samples = await preview.json() as { source: string; titles: unknown[] };
  assert.equal(samples.source, 'fixture');
  assert.equal(samples.titles.length, 14);
  assert.equal((await fetch(`${base}/v1/home`)).status, 401);
  const code = store.createPairingCode();
  const body = JSON.stringify({ code });
  const pair = await fetch(`${base}/v1/devices/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(pair.status, 200);
  const { credential, deviceId } = await pair.json() as { credential: string; deviceId: string };
  assert.equal((await fetch(`${base}/v1/devices/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status, 401);
  const headers = { authorization: `Bearer ${credential}`, 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/v1/catalog/movies?sort=bad`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/v1/catalog/search`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/v1/home`, { headers })).status, 503);
  assert.equal((await fetch(`${base}/v1/playback/sessions`, { method: 'POST', headers })).status, 501);
  assert.equal((await fetch(`${base}/v1/household/favorites`, { method: 'POST', headers, body: JSON.stringify({ id: 'id', favorite: 'yes' }) })).status, 400);
  store.revoke(deviceId);
  assert.equal((await fetch(`${base}/v1/home`, { headers })).status, 401);
});

test('mock uses the real adapter and authenticated routes with temporary favorites', async (t) => {
  assert.equal(jellyfinMode({}), 'mock');
  assert.equal(jellyfinMode({ HOUSEHOLD_JELLYFIN_MODE: 'mock' }), 'mock');
  assert.equal(jellyfinMode({ HOUSEHOLD_JELLYFIN_MODE: 'live', JELLYFIN_BASE_URL: 'http://localhost' }), 'live');
  assert.throws(() => jellyfinMode({ HOUSEHOLD_JELLYFIN_MODE: 'typo' }), /must be live or mock/);
  assert.throws(() => jellyfinMode({ HOUSEHOLD_JELLYFIN_MODE: 'mock', JELLYFIN_BASE_URL: 'http://localhost' }), /cannot be combined/);
  assert.throws(() => jellyfinMode({ JELLYFIN_API_KEY: 'example' }), /HOUSEHOLD_JELLYFIN_MODE=live/);
  const mock = await createMockJellyfin();
  const directory = mkdtempSync(join(tmpdir(), 'household-mock-api-'));
  const store = new DeviceStore(join(directory, 'devices.sqlite'));
  const app = await NestFactory.create(appModule(store, mock.jellyfin, 'mock'), { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => mock.server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const address = mock.server.address();
  assert.ok(address && typeof address !== 'string');
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/Items`)).status, 401);
  const base = await app.getUrl();
  const health = await (await fetch(`${base}/v1/health`)).json() as { catalogSource: string; jellyfinConfigured: boolean };
  assert.equal(health.catalogSource, 'mock');
  assert.equal(health.jellyfinConfigured, true);
  assert.equal((await fetch(`${base}/v1/catalog/movies`)).status, 401);
  const pairResponse = await fetch(`${base}/v1/devices/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: store.createPairingCode() }),
  });
  const pair = await pairResponse.json() as { credential: string };
  const headers = { authorization: `Bearer ${pair.credential}`, 'content-type': 'application/json' };
  const movies = await (await fetch(`${base}/v1/catalog/movies?genre=Adventure`, { headers })).json() as { id: string; isFavorite: boolean }[];
  assert.deepEqual(movies.map((item) => item.id), ['mock-film-1']);
  const series = await (await fetch(`${base}/v1/catalog/series`, { headers })).json() as { id: string }[];
  assert.equal(series[0].id, 'mock-series-1');
  const episodes = await (await fetch(`${base}/v1/series/mock-series-1/episodes`, { headers })).json() as { seasons: { episodes: unknown[] }[] };
  assert.equal(episodes.seasons[0].episodes.length, 2);
  const search = await (await fetch(`${base}/v1/catalog/search?q=First`, { headers })).json() as { id: string }[];
  assert.equal(search[0].id, 'mock-episode-1');
  assert.equal((await fetch(`${base}/v1/catalog/missing`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/v1/household/favorites`, {
    method: 'POST', headers, body: JSON.stringify({ id: 'mock-film-1', favorite: true }),
  })).status, 204);
  const detail = await (await fetch(`${base}/v1/catalog/mock-film-1`, { headers })).json() as { item: { isFavorite: boolean }; related: unknown[] };
  assert.equal(detail.item.isFavorite, true);
  assert.equal(detail.related.length, 1);
  assert.equal((await fetch(`${base}/v1/household/favorites`, {
    method: 'POST', headers, body: JSON.stringify({ id: 'mock-film-1', favorite: false }),
  })).status, 204);
  assert.equal((await mock.jellyfin.item('mock-film-1')).isFavorite, false);
  assert.equal((await fetch(`${base}/v1/playback/sessions`, { method: 'POST', headers })).status, 501);
  await mock.jellyfin.favorite('mock-film-1', true);
  const second = await createMockJellyfin();
  try {
    assert.equal((await mock.jellyfin.item('mock-film-1')).isFavorite, true);
    assert.equal((await second.jellyfin.item('mock-film-1')).isFavorite, false);
  } finally {
    await new Promise<void>((resolve, reject) => second.server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Jellyfin adapter sends a scoped request and propagates upstream failures', async (t) => {
  assert.throws(() => new Jellyfin({ JELLYFIN_BASE_URL: 'http://example.invalid/' }), /requires HTTPS/);
  const seen: string[] = [];
  const server = createServer((request, response) => {
    seen.push(request.url ?? '');
    assert.equal(request.headers['x-emby-token'], 'test-only-key');
    response.setHeader('content-type', 'application/json');
    if (request.url?.includes('searchTerm=unavailable')) {
      response.writeHead(503).end('{}');
      return;
    }
    if (request.url?.startsWith('/jellyfin/UserFavoriteItems/')) {
      response.writeHead(204).end();
      return;
    }
    const item = {
      Id: 'abc', Name: 'Example', Type: 'Movie', ProductionYear: 2020,
      UserData: { IsFavorite: false, PlayedPercentage: 25 }, MediaSources: [{ Id: 'source' }],
    };
    if (request.url?.startsWith('/jellyfin/Shows/')) {
      response.end(JSON.stringify({ Items: [{ ...item, Type: 'Episode', SeasonId: 'season', SeasonName: 'Season One', ParentIndexNumber: 1 }] }));
    } else if (request.url?.startsWith('/jellyfin/Items/abc?')) {
      response.end(JSON.stringify(item));
    } else if (request.url?.includes('includeItemTypes=Series')) {
      response.end(JSON.stringify({ Items: [] }));
    } else {
      response.end(JSON.stringify({ Items: [item] }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const jellyfin = new Jellyfin({
    JELLYFIN_BASE_URL: `http://127.0.0.1:${address.port}/jellyfin/`,
    JELLYFIN_API_KEY: 'test-only-key', JELLYFIN_HOUSEHOLD_USER_ID: 'test-user',
  });
  const items = await jellyfin.list('Movie');
  assert.deepEqual(items, [{
    id: 'abc', jellyfinItemId: 'abc', title: 'Example', type: 'movie', year: 2020,
    isFavorite: false, isPlayable: true, progressPercent: 25,
  }]);
  assert.match(seen[0], /^\/jellyfin\/Items\?/);
  assert.match(seen[0], /userId=test-user/);
  await assert.rejects(jellyfin.list('Movie', { searchTerm: 'unavailable' }), /Jellyfin request failed/);
  const directory = mkdtempSync(join(tmpdir(), 'household-api-http-test-'));
  const store = new DeviceStore(join(directory, 'devices.sqlite'));
  const device = store.pair(store.createPairingCode());
  assert.ok(device);
  const app = await NestFactory.create(appModule(store, jellyfin), { logger: false });
  await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = await app.getUrl();
  const { createPreviewServer } = await import(new URL('../../roku-preview/server.mjs', import.meta.url).href);
  const apiAddress = app.getHttpServer().address() as { port: number };
  const preview = createPreviewServer({ port: 0, apiPort: apiAddress.port });
  await new Promise<void>((resolve) => preview.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => preview.close((error: Error | undefined) => error ? reject(error) : resolve())));
  const previewBase = `http://127.0.0.1:${preview.address().port}`;
  assert.equal((await fetch(`${previewBase}/v1/preview/catalog`)).status, 200);
  assert.equal((await fetch(`${previewBase}/v1/catalog/movies`)).status, 401);
  const pairResponse = await fetch(`${previewBase}/v1/devices/pair`, {
    method: 'POST', headers: { origin: previewBase, 'content-type': 'application/json' },
    body: JSON.stringify({ code: store.createPairingCode() }),
  });
  assert.equal(pairResponse.status, 200);
  const browserPair = await pairResponse.json() as { credential: string; deviceId: string };
  const browserHeaders = { authorization: `Bearer ${browserPair.credential}` };
  const browserMovies = await (await fetch(`${previewBase}/v1/catalog/movies`, { headers: browserHeaders })).json() as { title: string }[];
  assert.equal(browserMovies[0].title, 'Example');
  assert.equal((await fetch(`${previewBase}/v1/household/favorites`, {
    method: 'POST', headers: { ...browserHeaders, origin: previewBase, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'abc', favorite: true }),
  })).status, 204);
  store.revoke(browserPair.deviceId);
  assert.equal((await fetch(`${previewBase}/v1/catalog/movies`, { headers: browserHeaders })).status, 401);
  const headers = { authorization: `Bearer ${device.credential}`, 'content-type': 'application/json' };
  for (const route of ['/v1/home', '/v1/catalog/movies?genre=Drama&sort=SortName&order=Ascending',
    '/v1/catalog/series', '/v1/catalog/search?q=Example', '/v1/catalog/abc', '/v1/series/abc/episodes']) {
    assert.equal((await fetch(`${base}${route}`, { headers })).status, 200, route);
  }
  const home = await (await fetch(`${base}/v1/home`, { headers })).json() as { rows: { items: { isPlayable: boolean }[] }[] };
  assert.equal(home.rows[0].items[0].isPlayable, true);
  const episodes = await (await fetch(`${base}/v1/series/abc/episodes`, { headers })).json() as { seasons: { id: string; episodes: unknown[] }[] };
  assert.equal(episodes.seasons[0].id, 'season');
  assert.equal(episodes.seasons[0].episodes.length, 1);
  assert.equal((await fetch(`${base}/v1/household/favorites`, { method: 'POST', headers, body: JSON.stringify({ id: 'abc', favorite: true }) })).status, 204);
  for (const route of ['/v1/playback/abc/progress', '/v1/playback/abc/stop']) {
    assert.equal((await fetch(`${base}${route}`, { method: 'POST', headers })).status, 501);
  }
});
