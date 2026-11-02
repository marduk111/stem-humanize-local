// Minimal zero-dependency static server for development (no build needed).
// Serves the repo root, picks a free port, opens the default browser.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.resolve(root, rel);

  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found: ' + url);
      return;
    }

    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
});

let port = 8000;
server.on('error', () => {
  if (port < 8050) { port += 1; server.listen(port, '127.0.0.1'); }
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log('Stem Humanize dev server: ' + url);
  console.log('Press Ctrl+C to stop.');
  exec(`start "" "${url}"`);
});
