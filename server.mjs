// node server.mjs -> http://localhost:3000. Static files + the same two routes the hosted version has (/air.json, /gbfs).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { planes, bikeFeed, tle } from './feeds.js';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), path = u.pathname;
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (path === '/gbfs') {
    try {
      const body = await bikeFeed(u.searchParams.get('city'), +u.searchParams.get('k'));
      if (body == null) return json(404, {});
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(body);
    } catch { return json(502, {}); }
  }
  if (path === '/tle') {
    try {
      const body = await tle(u.searchParams.get('group'));
      if (body == null) return json(404, {});
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(body);
    } catch { return json(502, {}); }
  }
  if (path === '/air.json') {
    try {
      const e = await planes(+u.searchParams.get('lat'), +u.searchParams.get('lon'));
      return json(e.status, e.data);
    } catch { return json(502, []); }
  }
  try {
    const f = path === '/' ? '/index.html' : path;
    const body = await readFile('.' + f); // read first so a missing file can still become a 404
    res.writeHead(200, { 'content-type': types[extname(f)] || 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(process.env.PORT || 3000, () => console.log('server up'));
