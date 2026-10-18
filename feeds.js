// Shared by server.mjs (local) and api/* (Vercel): fetches that browsers can't do themselves (no CORS) or shouldn't repeat.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { BIKES } from './bikes.js';

const H = { headers: { 'User-Agent': 'global-heartbeat/0.1 (+https://github.com/janlasota/Global-Heartbeat)' } };
const air = new Map(); // aircraft cache, 10s
const gbfs = new Map(); // bike feed cache, 30s
const tles = new Map(); // orbit data cache, 2h

export async function planes(lat, lon) {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return { status: 400, data: [] };
  const k = `${lat},${lon}`, hit = air.get(k);
  if (hit && Date.now() - hit.t < 10000) return hit;
  const r = await fetch(`https://api.adsb.lol/v2/point/${lat}/${lon}/60`, H);
  if (!r.ok) return hit ? { ...hit, status: 200 } : { status: r.status, data: [] }; // serve stale over failing
  const data = (await r.json()).ac
    .filter((a) => a.lat != null && a.lon != null)
    .map((a) => ({ id: a.hex, call: (a.flight || '').trim(), lat: a.lat, lon: a.lon, gs: a.gs || 0, trk: a.track || 0, gnd: a.alt_baro === 'ground', alt: typeof a.alt_baro === 'number' ? a.alt_baro : a.alt_geom, type: a.t, reg: a.r }));
  const entry = { t: Date.now(), status: 200, data };
  air.set(k, entry);
  return entry;
}

// TfL BikePoint -> GBFS-shaped info (k=0) / status (k=1)
function fromTfl(body, k) {
  const n = (p, key) => +p.additionalProperties.find((x) => x.key === key)?.value || 0;
  const stations = JSON.parse(body).map((p) => k === 0
    ? { station_id: p.id, name: p.commonName, lat: p.lat, lon: p.lon, capacity: n(p, 'NbDocks') }
    : { station_id: p.id, num_bikes_available: n(p, 'NbBikes'), num_ebikes_available: n(p, 'NbEBikes'), num_docks_available: n(p, 'NbEmptyDocks') });
  return JSON.stringify({ data: { stations } });
}

// returns the feed as a JSON string, or null for an unknown city/index. Only URLs listed in bikes.js are ever fetched.
export async function bikeFeed(city, k) {
  const url = Object.hasOwn(BIKES, city) ? BIKES[city][k] : null;
  if (!url) return null;
  const hit = gbfs.get(url);
  let body = hit && Date.now() - hit.t < 30000 ? hit.body : null;
  if (body == null) {
    const r = await fetch(url, H);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    body = await r.text();
    gbfs.set(url, { t: Date.now(), body });
  }
  return url.includes('tfl.gov.uk') ? fromTfl(body, k) : body;
}

// Satellite orbit data (TLE text) from CelesTrak. The value is "keep every Nth satellite" so the big Starlink list stays light.
// CelesTrak updates every 2 hours and answers repeat downloads with a 403, so the order is:
// memory cache -> disk cache (survives local restarts) -> live fetch -> any older copy -> snapshot bundled in data/.
const TLE_GROUPS = { stations: 1, visual: 1, starlink: 4 };
const TLE_MS = 7200000;
const read = (url) => readFile(url, 'utf8').catch(() => null);

export async function tle(group) {
  if (!Object.hasOwn(TLE_GROUPS, group)) return null;
  const mem = tles.get(group);
  if (mem && Date.now() - mem.t < TLE_MS) return mem.body;

  const cacheFile = new URL(`./.cache/tle-${group}.txt`, import.meta.url);
  const age = await stat(cacheFile).then((st) => Date.now() - st.mtimeMs, () => Infinity);
  if (age < TLE_MS) {
    const body = await read(cacheFile);
    if (body) { tles.set(group, { t: Date.now() - age, body }); return body; }
  }

  try {
    const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, H);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lines = (await r.text()).split(/\r?\n/).filter(Boolean), out = [];
    for (let i = 0; i + 2 < lines.length; i += 3) if ((i / 3) % TLE_GROUPS[group] === 0) out.push(lines[i], lines[i + 1], lines[i + 2]);
    const body = out.join('\n');
    tles.set(group, { t: Date.now(), body });
    mkdir(new URL('./.cache/', import.meta.url), { recursive: true })
      .then(() => writeFile(cacheFile, body))
      .catch(() => {}); // read-only hosting is fine, it just won't keep a disk copy
    return body;
  } catch (e) {
    const old = mem?.body ?? (await read(cacheFile)) ?? (await read(new URL(`./data/tle-${group}.txt`, import.meta.url)));
    if (old) return old; // slightly old orbits still look right for a swarm
    throw e;
  }
}
