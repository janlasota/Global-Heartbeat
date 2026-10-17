// Zoomed city view: Esri dark gray tiles + live bike stations (GBFS) + live aircraft (via server /air.json)
import { BIKES } from './bikes.js';
import { loadWeather, wxText } from './weather.js';
const T = 256;
const cv = document.getElementById('cityview');
const ctx = cv.getContext('2d');
const info = document.getElementById('cityinfo');
const legend = document.getElementById('legend');
const tiles = new Map();
const tip = document.getElementById('tip');
const loading = document.getElementById('loading');
const tonightCard = document.getElementById('tonight');

// slippy-map math: lon/lat <-> world pixels at zoom z
const wx = (lon, z) => ((lon + 180) / 360) * T * 2 ** z;
const wy = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * T * 2 ** z;
};
const lonOf = (x, z) => (x / (T * 2 ** z)) * 360 - 180;
const latOf = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (T * 2 ** z)))) * 180) / Math.PI;

let view, stations = [], planes = [], timers = [], raf = 0, W, H;

function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  let t = tiles.get(k);
  if (!t) {
    t = new Image();
    t.src = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
    tiles.set(k, t);
  }
  return t;
}

// rain radar (RainViewer): latest frame, refreshed every 5 min while a city is open
let radar = null;
let radarOn = true;
const radarRow = document.querySelector('#legend [data-radar]');
const radarBtn = document.getElementById('radar-toggle');
radarBtn.onclick = () => {
  radarOn = !radarOn;
  radarBtn.textContent = `Rain radar: ${radarOn ? 'on' : 'off'}`;
  radarRow.hidden = !radarOn;
};
function radarTile(z, x, y) {
  const k = `r${radar.path}/${z}/${x}/${y}`;
  let t = tiles.get(k);
  if (!t) {
    t = new Image();
    t.src = `${radar.host}${radar.path}/256/${z}/${x}/${y}/2/1_1.png`;
    tiles.set(k, t);
  }
  return t;
}
async function loadRadar() {
  try {
    const d = await (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json();
    radar = { host: d.host, path: d.radar.past.at(-1).path };
  } catch (e) { console.warn('radar', e); }
}

async function loadBikes(name) {
  const urls = BIKES[name];
  if (!urls) return;
  try {
    const [i, s] = await Promise.all(urls.map((_, k) => fetch(`/gbfs?city=${encodeURIComponent(name)}&k=${k}`).then((r) => r.json())));
    const st = new Map(s.data.stations.map((x) => [x.station_id, x]));
    stations = i.data.stations.map((x) => {
      const q = st.get(x.station_id);
      return { name: x.name, lat: x.lat, lon: x.lon, bikes: q?.num_bikes_available ?? 0, ebikes: q?.num_ebikes_available, docks: q?.num_docks_available, cap: x.capacity || 20 };
    });
  } catch (e) { console.warn('bikes', e); }
}

async function loadPlanes(c) {
  try {
    const r = await fetch(`/air.json?lat=${c.lat}&lon=${c.lon}`);
    if (!r.ok) return r.status;
    const next = await r.json();
    const t = performance.now();
    planes = next.map((p) => ({ ...p, t0: t }));
  } catch (e) { console.warn('planes', e); }
}

function draw() {
  ctx.fillStyle = '#04050a';
  ctx.fillRect(0, 0, W, H);
  const drawTiles = (zUse, get, alpha = 1) => {
    const f = 2 ** (view.z - zUse);
    const cx = wx(view.lon, zUse), cy = wy(view.lat, zUse);
    const x0 = Math.floor((cx - W / 2 / f) / T), x1 = Math.floor((cx + W / 2 / f) / T);
    const y0 = Math.floor((cy - H / 2 / f) / T), y1 = Math.floor((cy + H / 2 / f) / T);
    ctx.globalAlpha = alpha;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const im = get(zUse, x, y);
        if (im.complete && im.naturalWidth) ctx.drawImage(im, W / 2 + (x * T - cx) * f, H / 2 + (y * T - cy) * f, T * f + 0.5, T * f + 0.5);
      }
    ctx.globalAlpha = 1;
  };
  drawTiles(Math.round(view.z), tile);
  if (radar && radarOn) drawTiles(Math.min(7, Math.round(view.z)), radarTile, 0.35); // radar only exists up to zoom 7; stretched beyond
  const sx = (lon) => W / 2 + (wx(lon, view.z) - wx(view.lon, view.z));
  const sy = (lat) => H / 2 + (wy(lat, view.z) - wy(view.lat, view.z));
  const k = Math.max(0.6, view.z - 9); // dot size grows with zoom

  ctx.globalCompositeOperation = 'lighter';
  for (const s of stations) {
    const x = (s.x = sx(s.lon)), y = (s.y = sy(s.lat));
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const full = Math.min(1, s.bikes / s.cap);
    ctx.fillStyle = s.bikes ? `hsla(${180 - full * 20}, 100%, 55%, 0.85)` : 'rgba(255,46,147,0.7)'; // pink = empty
    ctx.beginPath();
    ctx.arc(x, y, (1.5 + full * 3) * k * 0.6, 0, 7);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  const now = performance.now();
  ctx.font = '10px ui-monospace, monospace';
  for (const p of planes) {
    // dead-reckon between polls: knots -> m/s, track degrees
    const dt = (now - p.t0) / 1000, m = p.gs * 0.514 * dt, r = (p.trk * Math.PI) / 180;
    const lat = p.lat + (m * Math.cos(r)) / 111320;
    const lon = p.lon + (m * Math.sin(r)) / (111320 * Math.cos((p.lat * Math.PI) / 180));
    const x = (p.x = sx(lon)), y = (p.y = sy(lat));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    ctx.fillStyle = p.gnd ? '#5a6' : '#ff2e93';
    ctx.shadowColor = '#ff2e93';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(4.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-4.5, 6);
    ctx.fill();
    ctx.restore();
    if (view.z > 10 && p.call) { ctx.fillStyle = '#cfe9ff'; ctx.fillText(p.call, x + 8, y + 3); }
  }
  ctx.fillStyle = 'rgba(207,233,255,0.5)';
  ctx.fillText('Map © Esri · bikes: GBFS · aircraft: adsb.lol', 8, H - 8);
  raf = requestAnimationFrame(draw);
}

// pan / wheel / pinch
const ptrs = new Map();
let pinch = 0;
const clampZ = () => (view.z = Math.min(16, Math.max(8, view.z)));
const pan = (dx, dy) => {
  view.lon = lonOf(wx(view.lon, view.z) - dx, view.z);
  view.lat = latOf(wy(view.lat, view.z) - dy, view.z);
};
cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e); pinch = 0; };
function hover(e) {
  // planes win over bike stations; 12px pick radius
  let best = null, bd = 144;
  for (const [list, kind] of [[stations, 'bike'], [planes, 'plane']])
    for (const o of list) {
      const d = (o.x - e.clientX) ** 2 + (o.y - e.clientY) ** 2;
      if (d <= bd) { bd = d; best = { o, kind }; }
    }
  cv.style.cursor = best ? 'help' : 'grab'; // info on hover, nothing to click
  if (!best) return void (tip.hidden = true);
  const { o, kind } = best;
  tip.innerHTML = kind === 'plane'
    ? `<b>${o.call || o.id}</b><br>${[o.type, o.reg].filter(Boolean).join(' · ') || 'unknown type'}<br>${[o.gnd ? 'on ground' : o.alt != null && `${o.alt.toLocaleString()} ft`, o.gs && `${Math.round(o.gs)} kt`, `hdg ${Math.round(o.trk)}°`].filter(Boolean).join(' · ')}`
    : `<b>${o.name}</b><br>${o.bikes} bikes${o.ebikes != null ? ` (${o.ebikes} e-bikes)` : ''} · ${o.docks ?? '?'} open docks`;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 220) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
  tip.hidden = false;
}
cv.onpointermove = (e) => {
  const prev = ptrs.get(e.pointerId);
  if (!prev) return hover(e);
  tip.hidden = true;
  cv.style.cursor = 'grabbing';
  ptrs.set(e.pointerId, e);
  if (ptrs.size === 1) pan(e.clientX - prev.clientX, e.clientY - prev.clientY);
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinch) { view.z += Math.log2(d / pinch); clampZ(); }
    pinch = d;
  }
};
cv.onpointerup = cv.onpointercancel = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
cv.onwheel = (e) => { e.preventDefault(); view.z += -e.deltaY * 0.002; clampZ(); };

// funny full-screen state when the aircraft feed rate-limits us; tap to dismiss
export function showRateLimited() {
  loading.querySelector('small').textContent = 'the sky is rate-limiting us. heart rate: panicking. planes are on a coffee break. tap to carry on anyway';
  loading.classList.remove('done');
  loading.classList.add('error');
}
loading.onclick = () => loading.classList.add('done');

export function openCity(c, onClose) {
  view = { lat: c.lat, lon: c.lon, z: 10 };
  stations = []; planes = [];
  W = cv.width = innerWidth; H = cv.height = innerHeight;
  cv.hidden = false;
  info.hidden = legend.hidden = false;
  const title = info.querySelector('b');
  title.textContent = c.name;
  loadWeather(c).then(() => { if (c.wx) title.textContent = `${c.name} \u00b7 ${wxText(c)}`; });
  legend.querySelectorAll('[data-bike]').forEach((r) => (r.hidden = !BIKES[c.name]));
  // only show the loading screen if it's actually hanging
  const hang = setTimeout(() => {
    loading.querySelector('small').textContent = `loading ${c.name}...`;
    loading.classList.remove('done', 'error');
  }, 700);
  Promise.allSettled([loadBikes(c.name), loadPlanes(c)]).then(([, pl]) => {
    clearTimeout(hang);
    if (pl.value === 429) showRateLimited();
    else loading.classList.add('done');
  });
  loadRadar();
  // sky card for this city (computed locally, so no loading state needed)
  import('./tonight.js').then((m) => { tonightCard.innerHTML = m.tonight(c); tonightCard.hidden = false; }).catch((e) => console.warn('tonight', e));
  timers = [setInterval(() => loadBikes(c.name), 60000), setInterval(() => loadPlanes(c), 10000), setInterval(loadRadar, 300000)];
  raf = requestAnimationFrame(draw);
  info.querySelector('button').onclick = () => {
    tip.hidden = true;
    tonightCard.hidden = true;
    clearTimeout(hang);
    loading.classList.add('done');
    cancelAnimationFrame(raf);
    timers.forEach(clearInterval);
    cv.hidden = info.hidden = legend.hidden = true;
    onClose();
  };
}
