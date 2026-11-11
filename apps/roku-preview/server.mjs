import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const previewRoot = path.dirname(fileURLToPath(import.meta.url));
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

export function createPreviewServer({ host = '127.0.0.1', port = 4173, apiPort = 3000 } = {}) {
  const server = createServer(async (request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    const address = server.address();
    const allowedHosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    if (!allowedHosts.includes(request.headers.host)) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (pathname.startsWith('/v1/')) {
      const readPaths = ['/v1/health', '/v1/preview/catalog', '/v1/home', '/v1/catalog/movies', '/v1/catalog/series'];
      const writePaths = ['/v1/devices/pair', '/v1/household/favorites'];
      const isRead = readPaths.includes(pathname) && request.method === 'GET';
      const isWrite = writePaths.includes(pathname) && request.method === 'POST';
      if ((!isRead && !isWrite) || new URL(request.url, 'http://localhost').search) {
        response.writeHead(404);
        response.end();
        return;
      }
      if (isWrite && request.headers.origin !== `http://${request.headers.host}`) {
        response.writeHead(403);
        response.end();
        return;
      }
      const headers = { accept: 'application/json' };
      if (request.headers.authorization) headers.authorization = request.headers.authorization;
      let body;
      try {
        if (isWrite) {
          const chunks = [];
          let length = 0;
          for await (const chunk of request) {
            length += chunk.length;
            if (length > 4096) {
              response.writeHead(413);
              response.end();
              return;
            }
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
          headers['content-type'] = 'application/json';
        }
        const upstream = await fetch(`http://127.0.0.1:${apiPort}${pathname}`, {
          method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        const chunks = [];
        let length = 0;
        if (upstream.body) {
          for await (const chunk of upstream.body) {
            length += chunk.length;
            if (length > 4 * 1024 * 1024) throw new Error('API response too large');
            chunks.push(chunk);
          }
        }
        response.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        });
        response.end(Buffer.concat(chunks));
      } catch {
        response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ message: 'Experience API unavailable' }));
      }
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    if (pathname === '/') pathname = '/index.html';

    const file = path.resolve(previewRoot, `.${pathname}`);
    if (!file.startsWith(`${previewRoot}${path.sep}`)) {
      response.writeHead(404);
      response.end();
      return;
    }

    let fileStat;
    try { fileStat = statSync(file); }
    catch {
      response.writeHead(404);
      response.end();
      return;
    }
    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }

    const headers = {
      'Content-Type': contentTypes.get(path.extname(file)) ?? 'application/octet-stream',
      'Content-Length': fileStat.size,
      'Content-Security-Policy': "default-src 'self'; img-src 'self' https://images.unsplash.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    };
    response.writeHead(200, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  });
  return server.listen(port, host);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535');
  const apiPort = Number(process.env.HOUSEHOLD_API_PORT ?? 3000);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('HOUSEHOLD_API_PORT must be a valid port');
  const server = createPreviewServer({ port, apiPort });
  server.on('listening', () => console.log(`Roku mock preview: http://localhost:${port}`));
}