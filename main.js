import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CITIES } from './cities.js';
import { openCity } from './city.js';
import { loadWeather, wxText, loadAqi, aqiText } from './weather.js';
import { unlock, lub, dub, toggleMute, laser, boom, whoosh, engineOn } from './sound.js';

const R = 1;
const canvas = document.getElementById('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x04050a);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(0, 0.6, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.6;
controls.maxDistance = 160;
controls.zoomSpeed = 1.6;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
// people who asked their OS for less motion get no idle spin and much calmer pulses
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (calm) controls.autoRotate = false;

// lat/lon (deg) -> unit vector. Sun uses same fn, so day/night lines up.
function toVec3(lat, lon, r = R) {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)).multiplyScalar(r);
}

// subsolar point from UTC time (approx, fine for visuals)
function sunDirection(date) {
  // Spencer's series: declination plus the equation of time (the Sun runs ~16 min fast/slow through the year).
  // Within ~0.5 degrees of the real Sun, so the day/night line matches the Sun drawn in the sky.
  const n = (date - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000; // days since Jan 1, 00:00 UTC
  const g = (2 * Math.PI * n) / 365;
  const decl = THREE.MathUtils.radToDeg(0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g));
  const eotMin = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const lon = -(utcH - 12 + eotMin / 60) * 15;
  return toVec3(decl, lon, 1).normalize();
}

// globe body: dark, slightly lit on day side
const globeMat = new THREE.ShaderMaterial({
  uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
  vertexShader: `
    varying vec3 vN;
    void main() {
      vN = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uSun;
    varying vec3 vN;
    void main() {
      float d = dot(normalize(vN), normalize(uSun));
      float day = smoothstep(-0.12, 0.25, d);
      vec3 night = vec3(0.012, 0.016, 0.035);
      vec3 dayC = vec3(0.04, 0.09, 0.15);
      gl_FragColor = vec4(mix(night, dayC, day), 1.0);
    }`,
});
const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64), globeMat);
scene.add(globe);

// graticule lines
function graticule() {
  const pts = [];
  const step = 5;
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let lon = -180; lon < 180; lon += step) {
      pts.push(toVec3(lat, lon, R * 1.001), toVec3(lat, lon + step, R * 1.001));
    }
  }
  for (let lon = -180; lon < 180; lon += 20) {
    for (let lat = -85; lat < 85; lat += step) {
      pts.push(toVec3(lat, lon, R * 1.001), toVec3(lat + step, lon, R * 1.001));
    }
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.12 }));
}
scene.add(graticule());

// land dots: sample lat/lon grid, keep points inside Natural Earth land polygons
function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const loading = document.getElementById('loading');
(async () => {
  try {
    const gj = await (await fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_land.geojson')).json();
    const polys = gj.features.flatMap((f) =>
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
    const pts = [];
    let row = 0;
    for (let lat = -85; lat <= 85; lat += 1.8) {
      const step = 1.8 / Math.max(Math.cos(THREE.MathUtils.degToRad(lat)), 0.1);
      for (let lon = -180; lon < 180; lon += step) {
        if (polys.some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h))))
          pts.push(toVec3(lat, lon, R * 1.002));
      }
      if (++row % 6 === 0) await new Promise(requestAnimationFrame); // yield so the page stays responsive
    }
    scene.add(new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.PointsMaterial({ color: 0x00f0ff, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false })
    ));
  } catch (e) { console.warn('land load failed', e); }
  loading.classList.add('done');
})();

// atmosphere glow rim
const rim = new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.12, 64, 64),
  new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vN;
      void main() {
        float i = pow(0.62 - dot(vN, vec3(0.0, 0.0, 1.0)), 3.0);
        gl_FragColor = vec4(0.0, 0.94, 1.0, 1.0) * clamp(i, 0.0, 1.0) * 0.6;
      }`,
  })
);
scene.add(rim);

// heartbeat curve: BPM by local hour. two rush-hour peaks, low overnight.
const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
function bpmForHour(h, act = 1) {
  // wrap distance so 23h -> 1h smooth
  const g = (mu, s) => Math.max(gauss(h, mu, s), gauss(h + 24, mu, s), gauss(h - 24, mu, s));
  return 42 + act * (48 * g(8.5, 1.8) + 52 * g(17.5, 2.0) + 18 * g(13, 3));
}

const fmts = new Map();
function localHour(tz, date) {
  let f = fmts.get(tz);
  if (!f) fmts.set(tz, f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }));
  const parts = f.formatToParts(date);
  const h = +parts.find((p) => p.type === 'hour').value % 24;
  const m = +parts.find((p) => p.type === 'minute').value;
  return { h: h + m / 60, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

// city objects
const cityGroup = new THREE.Group();
scene.add(cityGroup);
const heartTex = (() => {
  const s = 64, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const x = cv.getContext('2d');
  x.fillStyle = '#fff';
  x.beginPath();
  x.moveTo(32, 58);
  x.bezierCurveTo(-8, 30, 8, 2, 32, 20);
  x.bezierCurveTo(56, 2, 72, 30, 32, 58);
  x.fill();
  return new THREE.CanvasTexture(cv);
})();
const HEART = 0.05;
const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
const cities = CITIES.map(([name, lat, lon, tz, act]) => {
  const pos = toVec3(lat, lon, R * 1.004);
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, color: 0x00f0ff, depthTest: false }));
  dot.position.copy(pos);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: 0xff2e93, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  ring.position.copy(pos);
  ring.lookAt(pos.clone().multiplyScalar(2));
  // bigger invisible hit target for fingers
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(pos);
  const city = { name, lat, lon, tz, act, dot, ring, hit, phase: Math.random(), bpm: 60, air: null };
  hit.userData.city = city;
  cityGroup.add(dot, ring, hit);
  return city;
});

// real activity: fetched only for a city you click (one request, server caches 10s)
const AIR_REF = 120; // aircraft within 60nm that counts as "max busy"
async function loadAir(c) {
  if (c.airAt && Date.now() - c.airAt < 60000) return;
  c.airAt = Date.now();
  c.airErr = false;
  // retry with backoff; stay in "syncing" until every attempt has failed (~1 min)
  for (const wait of [0, 4000, 8000, 15000, 30000]) {
    if (wait) await new Promise((ok) => setTimeout(ok, wait));
    try {
      const r = await fetch(`/air.json?lat=${c.lat}&lon=${c.lon}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      c.air = (await r.json()).length;
      return;
    } catch (e) { console.warn('aircraft fetch failed', c.name, e.message); }
  }
  c.airErr = true;
  c.airAt = 0; // allow a fresh try on the next click
}
const bpmFor = (c, h) => (c.air == null ? bpmForHour(h, c.act) : 42 + 90 * Math.sqrt(Math.min(1, c.air / AIR_REF)));

// selection
const panel = document.getElementById('panel');
const pName = document.getElementById('p-name');
const pTime = document.getElementById('p-time');
const pBpm = document.getElementById('p-bpm');
const pAir = document.getElementById('p-air');
const pWx = document.getElementById('p-wx');
const pAq = document.getElementById('p-aq');
const simNow = () => new Date();
let selected = null;

// keep the panel just above the selected heart as the globe moves
function placePanel() {
  if (!selected) return;
  const v = selected.dot.position.clone().project(camera);
  if (!selected.dot.visible || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) {
    selected = null;
    panel.hidden = true;
    return;
  }
  const x = ((v.x + 1) / 2) * innerWidth, y = ((1 - v.y) / 2) * innerHeight;
  panel.style.left = Math.min(Math.max(x, 110), innerWidth - 110) + 'px';
  panel.style.top = Math.max(y - 22, panel.offsetHeight + 8) + 'px';
}

function renderPanel(now) {
  if (!selected) return;
  const { label } = localHour(selected.tz, now);
  pName.textContent = selected.name;
  pTime.textContent = `${label} local`;
  const syncing = selected.air == null && !selected.airErr;
  const live = selected.air != null;
  pBpm.className = pAir.className = syncing ? 'dots' : '';
  pBpm.textContent = live ? `${Math.round(selected.bpm)} BPM` : syncing ? 'BPM syncing' : 'BPM unavailable';
  pAir.textContent = live ? `${selected.air} aircraft within 60nm` : syncing ? 'aircraft loading' : 'aircraft unavailable';
  const wxLoading = !selected.wx && !selected.wxErr;
  pWx.className = wxLoading ? 'dots' : '';
  pWx.textContent = selected.wx ? wxText(selected) : wxLoading ? 'weather loading' : 'weather unavailable';
  const aqLoading = selected.aqi == null && !selected.aqiErr;
  pAq.className = aqLoading ? 'dots' : '';
  pAq.textContent = selected.aqi != null ? aqiText(selected) : aqLoading ? 'air quality loading' : 'air quality unavailable';
}

document.getElementById('enter').onclick = () => {
  if (!selected) return;
  controls.enabled = false;
  inCity = true;
  openCity(selected, () => {
    controls.enabled = true;
    inCity = false;
    selected = null; // leaving a city closes its menu; reopen by tapping the heart
    panel.hidden = true;
  });
};

// tap vs drag
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
let idleSince = performance.now();
const IDLE_MS = 8000;
const poke = () => { idleSince = performance.now(); controls.autoRotate = false; };
canvas.addEventListener('wheel', poke, { passive: true });
canvas.addEventListener('pointermove', poke);
let inCity = false;
function pickCity(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const camDir = camera.position.clone().normalize();
  // ignore cities on the far side of the globe
  const h = ray.intersectObjects(cities.map((c) => c.hit)).find((x) => x.object.position.clone().normalize().dot(camDir) > 0.1);
  return h ? h.object.userData.city : null;
}
const tip = document.getElementById('tip');
function pickQuake(e) {
  const camDir = camera.position.clone().normalize();
  let best = null, bd = 576; // 24px pick radius around the center dot
  for (const q of quakes) {
    if (q.pos.clone().normalize().dot(camDir) < 0.1) continue; // far side
    const v = q.pos.clone().project(camera);
    const d = (((v.x + 1) / 2) * innerWidth - e.clientX) ** 2 + (((1 - v.y) / 2) * innerHeight - e.clientY) ** 2;
    if (d <= bd) { bd = d; best = q; }
  }
  return best;
}
function pickISS(e) {
  if (!iss.visible) return false;
  const camDir = camera.position.clone().normalize();
  if (iss.position.clone().normalize().dot(camDir) < 0.05) return false; // behind the globe
  const v = iss.position.clone().project(camera);
  return (((v.x + 1) / 2) * innerWidth - e.clientX) ** 2 + (((1 - v.y) / 2) * innerHeight - e.clientY) ** 2 <= 400; // 20px
}
function showISS(e) {
  const d = issData;
  const pole = (n, a, b) => `${Math.abs(n).toFixed(1)}°${n >= 0 ? a : b}`;
  tip.innerHTML = `<b>International Space Station</b><br>${Math.round(d.velocity).toLocaleString()} km/h · ${Math.round(d.altitude)} km up`
    + `<br>over ${pole(d.latitude, 'N', 'S')}, ${pole(d.longitude, 'E', 'W')}`
    + `<br>${d.visibility === 'daylight' ? 'in sunlight' : d.visibility === 'eclipsed' ? 'in Earth’s shadow' : d.visibility}`
    + '<br>one orbit about every 92 min';
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 230) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
  tip.hidden = false;
}
function showSky(html, e) {
  tip.innerHTML = html;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 230) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
  tip.hidden = false;
}
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
function showQuake(q, e) {
  if (!q) return void (tip.hidden = true);
  const p = q.p;
  tip.innerHTML = `<b>M ${p.mag.toFixed(1)}</b> ${p.place}<br>${ago(p.time)} · ${Math.round(q.depth)} km deep`
    + (p.felt ? `<br>felt by ${p.felt.toLocaleString()} people` : '')
    + (p.tsunami ? '<br>tsunami flag set' : '');
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 230) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
  tip.hidden = false;
}
canvas.addEventListener('pointermove', (e) => {
  if (solar?.f > 0.4) { hoverQ = null; tip.hidden = true; canvas.style.cursor = solar.hit(e.clientX, e.clientY) ? 'pointer' : 'grab'; return; }
  if (downAt) { hoverQ = null; return void (tip.hidden = true); }
  const city = pickCity(e);
  const onShip = !city && ship?.pick(e.clientX, e.clientY);
  const onIss = !city && !onShip && pickISS(e);
  const q = city || onIss ? null : pickQuake(e);
  const skyHtml = !city && !onIss && !q ? (sky?.pick(e.clientX, e.clientY) ?? sats?.pick(e.clientX, e.clientY)) : null;
  canvas.style.cursor = city || onShip ? 'pointer' : onIss || q || skyHtml ? 'help' : 'grab';
  hoverQ = q;
  if (onShip) showSky('<b>Do a barrel roll!</b><br>click me', e);
  else if (skyHtml) showSky(skyHtml, e);
  else if (onIss) showISS(e);
  else showQuake(q, e);
});
canvas.addEventListener('pointerdown', (e) => {
  unlock();
  downAt = { x: e.clientX, y: e.clientY };
  poke();
});
function selectCity(c) {
  selected = c;
  loadAir(c);
  loadWeather(c);
  loadAqi(c);
  panel.hidden = false;
  renderPanel(simNow());
  placePanel();
}
// turn the globe so a city faces the camera
function faceCity(c) {
  camera.position.copy(c.dot.position).normalize().multiplyScalar(camera.position.length());
  controls.update();
  camera.updateMatrixWorld(); // so the menu is placed with the new view, not last frame's
  c.dot.visible = true; // it faces us now, and placePanel closes the menu for a heart it thinks is hidden
}
const jump = document.getElementById('jump');
for (const c of [...cities].sort((a, b) => a.name.localeCompare(b.name))) jump.add(new Option(c.name, c.name));
jump.onchange = () => {
  const c = cities.find((x) => x.name === jump.value);
  jump.value = '';
  if (!c || inCity) return;
  poke();
  tip.hidden = true;
  faceCity(c);
  selectCity(c);
};
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (inCity) document.querySelector('#cityinfo .back').click();
  else { selected = null; panel.hidden = true; tip.hidden = true; }
});

canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  if (solar?.f > 0.4) { solar.click(e.clientX, e.clientY); return; }
  const hit = pickCity(e);
  if (hit) {
    selectCity(hit);
  } else {
    selected = null;
    panel.hidden = true;
    const skyHtml = (sky?.pick(e.clientX, e.clientY) ?? sats?.pick(e.clientX, e.clientY));
    if (ship?.pick(e.clientX, e.clientY)) ship.roll();
    else if (pickISS(e)) showISS(e);
    else if (pickQuake(e)) showQuake(pickQuake(e), e);
    else if (skyHtml) showSky(skyHtml, e);
    else tip.hidden = true;
  }
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const labelsBtn = document.getElementById('labels');
let labelsOn = true;
labelsBtn.onclick = () => {
  labelsOn = !labelsOn;
  labelsBtn.textContent = `labels: ${labelsOn ? 'on' : 'off'}`;
  sky?.setLabels(labelsOn);
};
const muteBtn = document.getElementById('mute');
muteBtn.onclick = () => { unlock(); muteBtn.textContent = toggleMute() ? 'sound: off' : 'sound: on'; };

// earthquakes: USGS M2.5+ last 24h, one request on load then every 10 min. Orange rings, bigger = stronger.
const quakeGroup = new THREE.Group();
scene.add(quakeGroup);
let quakes = [];
let hoverQ = null;
const quakeDotGeo = new THREE.SphereGeometry(0.006, 8, 8);
async function loadQuakes() {
  try {
    const gj = await (await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')).json();
    quakeGroup.clear();
    quakes = gj.features.slice(0, 200).map((f) => {
      const [lon, lat] = f.geometry.coordinates, mag = f.properties.mag;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffb020, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const pos = toVec3(lat, lon, R * 1.003);
      ring.position.copy(pos);
      ring.lookAt(pos.clone().multiplyScalar(2));
      // steady center dot: the rings fade out, so this is the visible target to hover
      const dot = new THREE.Mesh(quakeDotGeo, new THREE.MeshBasicMaterial({ color: 0xffb020 }));
      dot.position.copy(pos);
      dot.scale.setScalar(0.6 + mag * 0.25);
      quakeGroup.add(ring, dot);
      return { ring, dot, base: 0.6 + mag * 0.25, pos, mag, off: Math.random(), p: f.properties, depth: f.geometry.coordinates[2] };
    });
  } catch (e) { console.warn('quakes', e); }
}
loadQuakes();
setInterval(loadQuakes, 600000);

// aurora: NOAA OVATION forecast, equirectangular canvas wrapped on a sphere just above the globe (additive green)
const auroraCv = document.createElement('canvas');
auroraCv.width = 360; auroraCv.height = 181;
const auroraTex = new THREE.CanvasTexture(auroraCv);
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.006, 64, 64),
  new THREE.MeshBasicMaterial({ map: auroraTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
));
async function loadAurora() {
  try {
    const d = await (await fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json')).json();
    const actx = auroraCv.getContext('2d');
    const img = actx.createImageData(360, 181);
    for (const [lon, lat, a] of d.coordinates) {
      // three's SphereGeometry u=0 sits at lon -90, so shift columns; row 0 = north pole
      const col = (((lon > 180 ? lon - 360 : lon) + 90 + 360) % 360) | 0, row = (90 - lat) | 0;
      const i = (row * 360 + col) * 4;
      img.data.set([61, 255, 154, a < 5 ? 0 : Math.min(255, a * 4)], i);
    }
    actx.putImageData(img, 0, 0);
    auroraTex.needsUpdate = true;
  } catch (e) { console.warn('aurora', e); }
}
loadAurora();
setInterval(loadAurora, 600000);

// ISS: position every 5s (wheretheiss.at allows 350 req / 5 min), eased between samples, with a short trail
const issTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = '#fff';
  x.shadowColor = '#fff';
  x.shadowBlur = 10;
  x.fillRect(29, 12, 6, 40); // truss
  x.fillRect(8, 26, 20, 12); // solar panels
  x.fillRect(36, 26, 20, 12);
  return new THREE.CanvasTexture(cv);
})();
const iss = new THREE.Sprite(new THREE.SpriteMaterial({ map: issTex }));
iss.scale.setScalar(0.07);
iss.visible = false;
scene.add(iss);
let issData = null;
const issTarget = new THREE.Vector3();
const issTrail = [];
const issLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
scene.add(issLine);
const keyEl = document.getElementById('key');
const keyBase = keyEl.innerHTML;
async function loadISS() {
  try {
    const d = await (await fetch('https://api.wheretheiss.at/v1/satellites/25544')).json();
    issData = d;
    issTarget.copy(toVec3(d.latitude, d.longitude, R * (1 + d.altitude / 6371)));
    if (!iss.visible) { iss.position.copy(issTarget); iss.visible = true; }
    issTrail.push(issTarget.clone());
    if (issTrail.length > 90) issTrail.shift();
    issLine.geometry.setFromPoints(issTrail);
    keyEl.innerHTML = `${keyBase}<i style="background:#fff"></i>ISS ${Math.round(d.velocity).toLocaleString()} km/h, ${Math.round(d.altitude)} km up <span id="iss-find">find</span>`;
  } catch (e) { console.warn('iss', e); }
}
keyEl.addEventListener('click', (e) => {
  if (!e.target.closest('#iss-find') || !iss.visible) return;
  controls.autoRotate = false;
  camera.position.copy(iss.position).normalize().multiplyScalar(camera.position.length());
  controls.update();
});
loadISS();
setInterval(loadISS, 5000);

// the sky: stars, Moon, planets, pulsars (see sky.js)
let sky = null;
import('./sky.js').then((s) => { sky = s.initSky(scene, camera, toVec3, sunDirection); }).catch((e) => console.warn('sky', e));

// phones: the four toggles live behind a Menu button (on wide screens CSS shows them all in a row)
document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS Safari ignores the viewport setting, this stops its page pinch-zoom
const toolsEl = document.getElementById('tools');
const menuBtn = document.getElementById('menu');
menuBtn.onclick = () => {
  const open = toolsEl.classList.toggle('open');
  menuBtn.textContent = open ? 'Close' : 'Menu';
  menuBtn.setAttribute('aria-expanded', open);
};

// satellites (see sats.js): off by default, and nothing is downloaded until the first time they're switched on
let sats = null;
const satsBtn = document.getElementById('sats');
let satsOn = false;
satsBtn.onclick = async () => {
  satsOn = !satsOn;
  satsBtn.textContent = `satellites: ${satsOn ? 'on' : 'off'}`;
  if (satsOn && !sats) {
    satsBtn.textContent = 'satellites: loading...';
    try {
      sats = await (await import('./sats.js')).initSats(scene, toVec3, camera);
    } catch (e) { console.warn('sats', e); }
    satsBtn.textContent = `satellites: ${satsOn ? (sats ? 'on' : 'unavailable') : 'off'}`;
  }
  sats?.set(satsOn);
};

// the starfighter toy (see ship.js), loaded on demand the first time it's switched on
let ship = null;
const shipBtn = document.getElementById('ship');
let shipOn = false;
// stereo position for a sound: where the thing is on screen, left to right
const panOf = (p) => Math.max(-1, Math.min(1, p.clone().project(camera).x)) * 0.8;
const sfx = {
  fire: (p) => !inCity && laser(panOf(p)),
  boom: (p) => !inCity && boom(panOf(p)),
  roll: (p) => !inCity && whoosh(panOf(p)),
};
let engineState = false;
shipBtn.onclick = async () => {
  unlock(); // browsers only start audio after a click, and this is one
  shipOn = !shipOn;
  shipBtn.textContent = `starfighters: ${shipOn ? 'on' : 'off'}`;
  try {
    ship ??= (await import('./ship.js')).initShip(scene, camera, toVec3, sfx);
    ship.set(shipOn);
  } catch (e) { console.warn('ship', e); }
};

// Solar System (see solar.js): zoom out past the sky, or press the button. Loaded the first time it's needed.
let solar = null, solarLoading = false;
async function loadSolar() {
  if (solar || solarLoading) return;
  solarLoading = true;
  try { solar = (await import('./solar.js')).initSolar({ scene, camera, controls, getNow: simNow, calm }); } catch (e) { console.warn('solar', e); }
}
document.getElementById('solar-btn').onclick = async () => {
  if (inCity) return;
  unlock();
  await loadSolar();
  solar?.open();
};

// main loop
const clock = new THREE.Clock();
let lastPanel = 0;
let lastBpm = -Infinity;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = simNow();

  globeMat.uniforms.uSun.value.copy(sunDirection(now));

  const camDir = camera.position.clone().normalize();
  for (const c of cities) c.dot.visible = c.dot.position.clone().normalize().dot(camDir) > 0.08;
  const tick = performance.now() - lastBpm > 1000;
  if (tick) lastBpm = performance.now();
  for (const c of cities) {
    if (tick) c.bpm = bpmFor(c, localHour(c.tz, now).h);
    const prev = c.phase;
    c.phase = (c.phase + (dt * c.bpm) / 60) % 1;
    const p = c.phase;
    if (c === selected && !inCity) {
      if (p < prev) lub();
      else if (prev < 0.18 && p >= 0.18) dub();
    }
    // lub-dub: main beat at 0, softer second at 0.18
    const beat = Math.exp(-(((p - 0.0) / 0.07) ** 2)) + 0.6 * Math.exp(-(((p - 0.18) / 0.07) ** 2));
    c.dot.scale.setScalar(HEART * (1 + beat * (calm ? 0.2 : 0.9)));
    const ringScale = 0.02 + p * 0.09;
    c.ring.scale.setScalar(ringScale);
    c.ring.material.opacity = Math.max(0, (1 - p) ** 2) * 0.7 * (c.bpm / 90) * (calm ? 0.3 : 1);
    // faster hearts run hotter pink
    c.dot.material.color.setHSL(0.5 - (c.bpm - 42) / 120 * 0.2, 1, 0.55);
  }

  if (!solar && camera.position.length() > 8) loadSolar(); // zooming out far enough brings the planets in
  solar?.update(dt);
  const far = solar?.f ?? 0;
  sky?.update(now);
  sky?.setFar(far, camera.position);
  const wantEngine = shipOn && !inCity; // hum only while the fighters are on screen
  if (wantEngine !== engineState) { engineState = wantEngine; engineOn(wantEngine); }
  sats?.update(now);
  ship?.update(dt);
  iss.position.lerp(issTarget, 0.05);
  const qt = performance.now() / 3000;
  for (const q of quakes) {
    const p = calm ? 0.5 : (qt + q.off) % 1; // calm: still rings instead of pulsing ones
    q.ring.scale.setScalar(0.01 + p * 0.012 * q.mag);
    q.ring.material.opacity = calm ? 0.35 : (1 - p) ** 1.5 * 0.8;
    q.dot.scale.setScalar(q.base * (q === hoverQ ? 1.8 : 1));
  }

  if (performance.now() - lastPanel > 1000) {
    renderPanel(now);
    lastPanel = performance.now();
  }

  if (selected || inCity) idleSince = performance.now(); // never spin out from under an open menu
  else if (!calm && !controls.autoRotate && performance.now() - idleSince > IDLE_MS) { controls.autoRotate = true; tip.hidden = true; }
  controls.update();
  renderer.render(scene, camera);
  placePanel();
  requestAnimationFrame(frame);
}
frame();
