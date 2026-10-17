// Shared by server.mjs (local) and api/* (Vercel): fetches that browsers can't do themselves (no CORS) or shouldn't repeat.
import { BIKES } from './bikes.js';

const H = { headers: { 'User-Agent': 'heartbeat-globe/0.1 (personal hobby project)' } };
const air = new Map(); // aircraft cache, 10s
const gbfs = new Map(); // bike feed cache, 30s

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
