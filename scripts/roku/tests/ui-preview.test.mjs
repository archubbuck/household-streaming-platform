import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewServer } from '../../../apps/roku-preview/server.mjs';

test('Roku mock preview serves its UI and local assets with restrictive headers', async (t) => {
  const server = createPreviewServer({ host: '127.0.0.1', port: 0 });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await page.text(), /data-source="mock"/);

  const script = await fetch(`${base}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  const application = await script.text();
  assert.match(application, /label: 'Movies'/);
  assert.match(application, /label: 'Shows'/);
  assert.match(application, /catalog-hero/);
  assert.match(application, /posterCards: true/);
  assert.match(application, /\['Drama', 'Mystery', 'Adventure'\]/);
  assert.match(application, /\['Human stories', 'Mystery', 'Nature'\]/);
  assert.match(application, /ArrowLeft/);

  const stylesheet = await fetch(`${base}/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /text\/css/);

  assert.equal((await fetch(`${base}/not-found`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});