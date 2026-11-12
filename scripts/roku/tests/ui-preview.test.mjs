import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createPreviewServer } from '../../../apps/roku-preview/server.mjs';

const sample = (id, type = 'Movie') => ({
  id, type, title: id, year: 2024, runtime: '1h', genre: 'Drama',
  description: 'Sample description', image: 'https://images.unsplash.com/sample',
});
const fixture = {
  source: 'fixture', titles: [sample('tideglass'), sample('northbound', 'Show')],
  featured: { ...sample('tideglass'), eyebrow: 'SAMPLE' },
  progress: [['northbound', 68]], favorites: ['tideglass'],
};

async function servers(t) {
  const seen = [];
  let deny = false;
  let empty = false;
  let failFavorite = false;
  let catalogSource = 'live';
  const api = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({ path: req.url, method: req.method, authorization: req.headers.authorization, body: Buffer.concat(chunks).toString() });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/preview/catalog') return res.end(JSON.stringify(fixture));
    if (req.url === '/v1/health') return res.end(JSON.stringify({ catalogSource }));
    if (req.url === '/v1/devices/pair') return res.end(JSON.stringify({ credential: 'a'.repeat(43), deviceId: '01234567-0123-0123-0123-0123456789ab' }));
    if (req.headers.authorization !== `Bearer ${'a'.repeat(43)}` || deny) return res.writeHead(401).end('{}');
    if (req.url === '/v1/household/favorites') return res.writeHead(failFavorite ? 502 : 204).end();
    if (req.url === '/v1/catalog/movies') return res.end(JSON.stringify(empty ? [] : [{ id: 'real1', title: 'Real film', type: 'movie', isFavorite: false, isPlayable: true }]));
    if (req.url === '/v1/catalog/series') return res.end('[]');
    res.writeHead(404).end('{}');
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => api.once('listening', resolve));
  const preview = createPreviewServer({ port: 0, apiPort: api.address().port });
  await new Promise((resolve) => preview.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => preview.close((error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
  });
  return {
    base: `http://127.0.0.1:${preview.address().port}`, seen,
    deny: () => { deny = true; }, empty: () => { empty = true; },
    failFavorite: (value) => { failFavorite = value; },
    mock: () => { catalogSource = 'mock'; },
  };
}

test('preview forwards only the permitted API routes and protects local pairing and mutations', async (t) => {
  const { base, seen } = await servers(t);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await page.text(), /data-source="mock"/);
  assert.deepEqual(await (await fetch(`${base}/v1/preview/catalog`)).json(), fixture);
  assert.equal(seen[0].path, '/v1/preview/catalog');
  assert.equal((await fetch(`${base}/v1/catalog/movies`, { headers: { authorization: 'Bearer invalid' } })).status, 401);
  assert.equal((await fetch(`${base}/v1/household/favorites`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${base}/v1/devices/pair`, { method: 'POST', headers: { origin: 'https://evil.invalid' } })).status, 403);
  assert.equal((await fetch(`${base}/v1/devices/pair`, { method: 'POST', headers: { origin: base }, body: 'x'.repeat(4097) })).status, 413);
  assert.equal((await fetch(`${base}/v1/catalog/movies?q=x`)).status, 404);
  assert.equal((await fetch(`${base}/v1/playback/sessions`, { method: 'POST', headers: { origin: base } })).status, 404);
  const hostileHost = await new Promise((resolve, reject) => {
    get(base, { headers: { host: 'evil.invalid' } }, (response) => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(hostileHost, 403);
  assert.equal((await fetch(`${base}/not-found`)).status, 404);
});

test('preview renders samples, pairs for real titles, writes real favorites and shows revoked access', async (t) => {
  const { base, seen, deny, empty, failFavorite, mock } = await servers(t);
  const script = await readFile(new URL('../../../apps/roku-preview/app.js', import.meta.url), 'utf8');
  const elements = Object.fromEntries(['primary-nav', 'screen-content', 'overlay-root', 'screen-kicker', 'source-status', 'pairing-code', 'pairing-error']
    .map((id) => [id, { innerHTML: '', textContent: '', value: '', querySelector: () => ({ focus() {} }) }]));
  const handlers = {};
  const logs = [];
  const alerts = [];
  const click = (action, data = {}) => handlers.click({ target: { closest: () => ({ dataset: { action, ...data }, setAttribute() {} }) } });
  vm.runInNewContext(script, {
    document: {
      querySelector: (selector) => elements[selector.slice(1)],
      addEventListener: (event, handler) => { handlers[event] = handler; },
    },
    fetch: (url, options = {}) => fetch(`${base}${url}`, { ...options, headers: { ...options.headers, ...(options.method === 'POST' ? { origin: base } : {}) } }),
    URL, console: { error: (...args) => logs.push(args) }, requestAnimationFrame: () => {}, window: { alert: (message) => alerts.push(message) },
  });
  const waitFor = async (condition) => {
    for (let i = 0; i < 100; i += 1) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('Preview did not reach expected state');
  };
  await waitFor(() => elements['screen-content'].innerHTML.includes('tideglass'));
  assert.equal(elements['source-status'].textContent, 'API SAMPLES');
  click('pair-dialog');
  elements['pairing-code'].value = 'b'.repeat(43);
  click('pair-submit');
  await waitFor(() => elements['screen-content'].innerHTML.includes('Real film'));
  assert.match(elements['screen-content'].innerHTML, /Sample titles · simulated/);
  assert.match(elements['screen-content'].innerHTML, /Runtime unavailable/);
  assert.equal(elements['source-status'].textContent, 'JELLYFIN + API SAMPLES');
  mock();
  click('retry-catalog');
  await waitFor(() => elements['source-status'].textContent === 'MOCK JELLYFIN + API SAMPLES');
  assert.match(elements['screen-content'].innerHTML, /MOCK JELLYFIN · SIMULATED/);
  click('favorite', { id: 'real-real1' });
  await waitFor(() => seen.some((entry) => entry.path === '/v1/household/favorites'));
  const favorite = seen.find((entry) => entry.path === '/v1/household/favorites');
  assert.deepEqual(JSON.parse(favorite.body), { id: 'real1', favorite: true });
  failFavorite(true);
  click('favorite', { id: 'real-real1' });
  await waitFor(() => alerts.length === 1);
  assert.match(alerts[0], /Unable to update/);
  failFavorite(false);
  empty();
  click('retry-catalog');
  await waitFor(() => elements['screen-content'].innerHTML.includes('Your Jellyfin library is empty'));
  click('navigate', { screen: 'movies' });
  assert.match(elements['screen-content'].innerHTML, /No Jellyfin movies available/);
  assert.match(elements['screen-content'].innerHTML, /Sample titles · simulated/);
  deny();
  click('retry-catalog');
  await waitFor(() => elements['screen-content'].innerHTML.includes('Unable to load'));
  assert.equal(logs.length, 2);
  assert.doesNotMatch(elements['screen-content'].innerHTML, /tideglass/);
  click('pair-dialog');
  click('disconnect');
  await waitFor(() => elements['source-status'].textContent === 'API SAMPLES');
});

test('preview reports an unavailable Experience API', async (t) => {
  const api = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => api.once('listening', resolve));
  const port = api.address().port;
  await new Promise((resolve) => api.close(resolve));
  const preview = createPreviewServer({ port: 0, apiPort: port });
  await new Promise((resolve) => preview.once('listening', resolve));
  t.after(() => new Promise((resolve) => preview.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${preview.address().port}/v1/preview/catalog`);
  assert.equal(response.status, 502);
  assert.match((await response.json()).message, /unavailable/);
});
