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

export function createPreviewServer({ host = '0.0.0.0', port = 4173 } = {}) {
  return createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
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
  }).listen(port, host);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535');
  const server = createPreviewServer({ port });
  server.on('listening', () => console.log(`Roku mock preview: http://localhost:${port}`));
}