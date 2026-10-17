// The sky around the globe: real stars + constellation lines, the Moon, the planets, and a few famous pulsars.
// Everything sits on big spheres around the Earth (directions are real, distances are not to scale).
// Loaded dynamically from main.js so a CDN hiccup can't break the globe.
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';

const DATA = 'https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@v0.7.32/data/';
const R_STARS = 50, R_PLANETS = 40, R_MOON = 18;
const KM_PER_AU = 149597870.7;

// name, nickname, RA [h m s], Dec [sign d m s], spin period (s), blurb. Positions/periods are from the well-known catalog values.
const PULSARS = [
  ['PSR B0531+21', 'Crab Pulsar', [5, 34, 31.97], [1, 22, 0, 52.1], 0.0334, 'left over from the supernova seen in 1054'],
  ['PSR B0833-45', 'Vela Pulsar', [8, 35, 20.66], [-1, 45, 10, 34.9], 0.08934, 'one of the brightest pulsars in gamma rays'],
  ['PSR J0633+1746', 'Geminga', [6, 33, 54.15], [1, 17, 46, 12.9], 0.2371, 'a pulsar that shines only in gamma rays'],
  ['PSR B0329+54', null, [3, 32, 59.37], [1, 54, 34, 43.6], 0.7145, 'one of the brightest pulsars in radio'],
  ['PSR B1919+21', 'first pulsar ever found', [19, 21, 44.8], [1, 21, 53, 2], 1.3373, 'discovered in 1967, first nicknamed LGM-1 for "little green men"'],
  ['PSR B1937+21', null, [19, 39, 38.56], [1, 21, 34, 59.1], 0.0015578, 'spins 642 times a second'],
  ['PSR J0437-4715', null, [4, 37, 15.88], [-1, 47, 15, 9.1], 0.0057575, 'the closest millisecond pulsar to us'],
  ['PSR B1913+16', 'Hulse-Taylor', [19, 15, 27.99], [1, 16, 6, 27.4], 0.05903, 'its orbit proved gravitational waves exist'],
  ['PSR B1257+12', null, [13, 0, 3.58], [1, 12, 40, 56.5], 0.006219, 'host of the first exoplanets ever found'],
];

const PLANETS = [
  ['Mercury', '#b5b5b5'], ['Venus', '#ffe9b0'], ['Mars', '#ff7a50'], ['Jupiter', '#ffd29a'],
  ['Saturn', '#f0dca0'], ['Uranus', '#9fe8ee'], ['Neptune', '#6f8cff'],
];

const glow = (color) => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
};

// Sun/Moon/planet names are the same size on screen at any distance or zoom (sizeAttenuation off).
const LABEL = [0.1756, 0.0439];
const labelSprite = (text) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = '28px ui-monospace, monospace';
  x.fillStyle = 'rgba(207,233,255,0.8)';
  x.textAlign = 'center';
  x.fillText(text, 128, 40);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, sizeAttenuation: false }));
  s.center.set(0.5, -0.5); // sits above its object on screen
  return s;
};

// B-V color index -> blue-white-orange tint
function starColor(bv) {
  const t = Math.min(1, Math.max(0, (bv + 0.3) / 1.9));
  const [a, b, f] = t < 0.4 ? [[0.65, 0.78, 1], [1, 1, 1], t / 0.4] : [[1, 1, 1], [1, 0.78, 0.55], (t - 0.4) / 0.6];
  return a.map((v, i) => v + (b[i] - v) * f);
}

const PHASES = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];

export function initSky(scene, camera, toVec3, sunDirection) {
  const amp = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.2 : 1; // calmer pulsars on request
  const group = new THREE.Group(); // turns with Earth's sidereal rotation so stars drift across the sky correctly
  scene.add(group);
  const pickable = []; // { obj, radius(px), html(), prio? }  (lower prio wins)
  const labels = []; // star/constellation/asterism/DSO labels, so the 'labels' button can hide them

  // stars + constellation lines
  (async () => {
    const [stars, lines, cons, names] = await Promise.all(['stars.6.json', 'constellations.lines.json', 'constellations.json', 'starnames.json'].map((f) => fetch(DATA + f).then((r) => r.json())));
    const buckets = [[2.5, 3.4, 1], [4.2, 2.2, 0.85], [99, 1.5, 0.6]].map(([max, size, opacity]) => ({ max, size, opacity, pos: [], col: [] }));
    for (const f of stars.features) {
      const [ra, dec] = f.geometry.coordinates, b = buckets.find((k) => f.properties.mag < k.max);
      b.pos.push(...toVec3(dec, ra, R_STARS).toArray());
      b.col.push(...starColor(+f.properties.bv || 0.4));
    }
    const dot = glow('rgba(255,255,255,1)');
    for (const b of buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      group.add(new THREE.Points(g, new THREE.PointsMaterial({
        size: b.size, sizeAttenuation: false, vertexColors: true, map: dot, transparent: true, opacity: b.opacity, depthWrite: false,
      })));
    }
    const seg = [];
    for (const f of lines.features)
      for (const line of f.geometry.coordinates)
        for (let i = 0; i < line.length - 1; i++)
          seg.push(...toVec3(line[i][1], line[i][0], R_STARS).toArray(), ...toVec3(line[i + 1][1], line[i + 1][0], R_STARS).toArray());
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a6a88, transparent: true, opacity: 0.2, depthWrite: false })));

    // --- labels: constellations, bright named stars, asterisms, deep-sky objects ---
    const conById = new Map(cons.features.map((f) => [f.id, f.properties]));
    const tag = (text, color, w, anchorLeft) => {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 64;
      const x = c.getContext('2d');
      x.font = '34px ui-monospace, monospace';
      x.fillStyle = color;
      x.textAlign = anchorLeft ? 'left' : 'center';
      x.fillText(text, anchorLeft ? 8 : 256, 42);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      sp.scale.set(w, w / 8, 1);
      if (anchorLeft) sp.center.set(0, 0.5);
      labels.push(sp);
      return sp;
    };
    const add = (pos, label, html, radius, prio) => {
      label.position.copy(pos);
      group.add(label);
      const hit = new THREE.Object3D();
      hit.position.copy(pos);
      group.add(hit);
      pickable.push({ obj: hit, radius, prio, html: () => html });
    };
    for (const f of cons.features) {
      const p = f.properties, [ra, dec] = f.geometry.coordinates;
      add(toVec3(dec, ra, R_STARS), tag(p.name.toUpperCase(), 'rgba(120,170,200,0.5)', 12),
        `<b>${p.name}</b><br>${p.en && p.en !== p.name ? `"${p.en}"<br>` : ''}constellation (${p.desig})`, 26, 5);
    }
    const hue = (bv) => (bv < 0 ? 'blue-white' : bv < 0.5 ? 'white' : bv < 1 ? 'yellow' : 'orange');
    for (const f of stars.features) {
      const n = names[f.id];
      if (!n?.name || f.properties.mag >= 2) continue;
      const con = conById.get(n.c), [ra, dec] = f.geometry.coordinates;
      add(toVec3(dec, ra, R_STARS), tag(n.name, 'rgba(235,245,255,0.8)', 7, true),
        `<b>${n.name}</b><br>${n.bayer ? `${n.bayer} ${con?.gen ?? ''}<br>` : ''}${hue(+f.properties.bv)} star, magnitude ${f.properties.mag}`, 14, 3);
    }
    const byHip = new Map(stars.features.map((f) => [f.id, f.geometry.coordinates]));
    const vec = (id) => toVec3(byHip.get(id)[1], byHip.get(id)[0], R_STARS);
    const ASTERISMS = [
      ["Orion's Belt", [[25930, 26311, 26727]], 'three hot blue supergiants roughly 1,200 to 2,000 light-years away'],
      ['Big Dipper', [[54061, 53910, 58001, 59774, 54061], [59774, 62956, 65378, 67301]], 'part of Ursa Major. Its two end stars point to Polaris'],
      ['Summer Triangle', [[91262, 102098, 97649, 91262]], 'Vega, Deneb and Altair, high overhead on northern summer evenings'],
      ['Southern Cross', [[60718, 61084], [62434, 59747]], 'Crux, the smallest constellation, used for finding south'],
      ['Great Square of Pegasus', [[113963, 113881, 677, 1067, 113963]], 'marks autumn in the northern sky. One corner, Alpheratz, belongs to Andromeda'],
      ['Winter Triangle', [[27989, 32349, 37279, 27989]], 'Betelgeuse, Sirius and Procyon, rising on northern winter evenings'],
    ];
    const aseg = [];
    for (const [name, polys, blurb] of ASTERISMS) {
      const all = [];
      for (const poly of polys) for (let i = 0; i < poly.length - 1; i++) aseg.push(...vec(poly[i]).toArray(), ...vec(poly[i + 1]).toArray());
      for (const poly of polys) for (const id of poly) all.push(vec(id));
      const mid = all.reduce((a, v) => a.add(v), new THREE.Vector3()).normalize().multiplyScalar(R_STARS);
      add(mid, tag(name, 'rgba(127,255,232,0.9)', 11), `<b>${name}</b><br>asterism: a famous pattern<div class="fact">${blurb}</div>`, 30, 4);
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(aseg, 3));
    group.add(new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: 0x7fffe8, transparent: true, opacity: 0.55, depthWrite: false })));
    const DSOS = [
      ['Orion Nebula (M42)', 83.82, -5.39, 'a star nursery about 1,340 light-years away. The fuzzy middle "star" of Orion\u2019s sword'],
      ['Pleiades (M45)', 56.75, 24.12, 'the Seven Sisters, a young star cluster about 444 light-years away'],
      ['Andromeda Galaxy (M31)', 10.68, 41.27, 'our nearest big galaxy, about 2.5 million light-years away. The most distant thing most people can see by eye'],
      ['Large Magellanic Cloud', 80.89, -69.76, 'a small companion galaxy of the Milky Way, about 160,000 light-years away, seen from the southern hemisphere'],
    ];
    for (const [name, ra, dec, blurb] of DSOS) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('rgba(255,120,190,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.scale.setScalar(2.2);
      m.position.copy(toVec3(dec, ra, R_STARS));
      group.add(m);
      add(toVec3(dec, ra, R_STARS), tag(name, 'rgba(255,150,205,0.9)', 11), `<b>${name}</b><br>deep-sky object<div class="fact">${blurb}</div>`, 20, 2);
    }
  })().catch((e) => console.warn('stars', e));

  // Moon: lit by the same sun direction the globe uses
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), new THREE.MeshLambertMaterial({ color: 0xc4c9d2 }));
  const moonLabel = labelSprite('Moon');
  moonLabel.scale.set(LABEL[0], LABEL[1], 1);
  moonLabel.position.set(0, 0.75, 0); // just above the Moon's disc
  moon.add(moonLabel);
  group.add(moon);
  const sunLight = new THREE.DirectionalLight(0xffffff, 3);
  scene.add(sunLight, new THREE.AmbientLight(0x1a2438, 1.2));
  let moonInfo = '';
  pickable.push({ obj: moon, radius: 28, html: () => moonInfo });

  // planets
  const planets = PLANETS.map(([name, color]) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(color), transparent: true, depthWrite: false }));
    sprite.scale.setScalar(1.6);
    const label = labelSprite(name);
    label.scale.set(LABEL[0] / 1.6, LABEL[1] / 1.6, 1); // parent sprite is scaled 1.6
    sprite.add(label);
    group.add(sprite);
    const p = { name, sprite, info: '' };
    pickable.push({ obj: sprite, radius: 20, html: () => p.info });
    return p;
  });

  // the Sun
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('rgba(255,236,170,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sun.scale.setScalar(7);
  const sunLabel = labelSprite('Sun');
  sunLabel.scale.set(LABEL[0] / 7, LABEL[1] / 7, 1); // parent sprite is scaled 7
  sunLabel.position.set(0, 0.17, 0); // just clears the Sun's bright core, same small gap as the planets
  sun.add(sunLabel);
  group.add(sun);
  let sunInfo = '';
  pickable.push({ obj: sun, radius: 34, html: () => sunInfo });

  // pulsars: slowed so the fastest still beat gently (never faster than ~1.4 per second)
  const pulsars = PULSARS.map(([name, nick, ra, dec, period, blurb]) => {
    const raDeg = (ra[0] + ra[1] / 60 + ra[2] / 3600) * 15;
    const decDeg = dec[0] * (dec[1] + dec[2] / 60 + dec[3] / 3600);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('rgba(120,255,240,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.position.copy(toVec3(decDeg, raDeg, R_STARS));
    group.add(sprite);
    const shown = period >= 0.7 ? period : 0.7 + 0.12 * Math.log10(period / 0.001);
    const slow = shown / period;
    const html = `<b>${nick ?? name}</b>${nick ? `<br>${name}` : ''}<br>spins ${(1 / period).toLocaleString(undefined, { maximumFractionDigits: 1 })} times a second`
      + `<br>${slow > 1.05 ? `shown slowed ${Math.round(slow)}x` : 'shown in real time'}<div class="fact">${blurb}</div>`;
    pickable.push({ obj: sprite, radius: 18, html: () => html });
    return { sprite, shown, offset: Math.random() };
  });

  let last = 0;
  const place = (obj, body, date, radius) => {
    const v = Astronomy.GeoVector(body, date, true), e = Astronomy.EquatorFromVector(v);
    obj.position.copy(toVec3(e.dec, e.ra * 15, radius));
    return { e, km: e.dist * KM_PER_AU };
  };

  const tmp = new THREE.Vector3(), cam = new THREE.Vector3();
  return {
    update(date) {
      group.rotation.y = -((Astronomy.SiderealTime(date) * 15 * Math.PI) / 180);
      sunLight.position.copy(sunDirection(date)).multiplyScalar(10);
      if (Date.now() - last > 60000) { // Moon/planets move slowly, once a minute is plenty
        last = Date.now();
        const m = place(moon, 'Moon', date, R_MOON);
        const ang = Astronomy.MoonPhase(date), il = Astronomy.Illumination('Moon', date).phase_fraction;
        moonInfo = `<b>Moon</b><br>${PHASES[Math.round(ang / 45) % 8]}, ${Math.round(il * 100)}% lit<br>${Math.round(m.km).toLocaleString()} km away<br>in ${Astronomy.Constellation(m.e.ra, m.e.dec).name}`;
        const sn = place(sun, 'Sun', date, 44);
        const mins = sn.km / 299792.458 / 60;
        sunInfo = `<b>Sun</b><br>our star, a yellow dwarf<br>${Math.round(sn.km / 1e6).toLocaleString()} million km away<div class="fact">its light takes ${Math.floor(mins)} min ${Math.round((mins % 1) * 60)} s to reach us</div>`;
        for (const p of planets) {
          const r = place(p.sprite, p.name, date, R_PLANETS);
          p.info = `<b>${p.name}</b><br>${r.e.dist.toFixed(2)} AU from Earth<br>in ${Astronomy.Constellation(r.e.ra, r.e.dec).name}`;
        }
      }
      const t = performance.now() / 1000;
      for (const p of pulsars) {
        const phase = (t / p.shown + p.offset) % 1;
        p.sprite.scale.setScalar(1.3 + 1.6 * amp * Math.exp(-((phase / 0.18) ** 2)));
        p.sprite.material.opacity = 0.55 + 0.45 * amp * Math.exp(-((phase / 0.18) ** 2));
      }
    },
    setLabels(on) { for (const l of labels) l.visible = on; },
    // returns tooltip html for the sky object under (x, y), or null
    pick(x, y) {
      cam.copy(camera.position);
      let best = null, bd = Infinity;
      for (const o of pickable) {
        o.obj.getWorldPosition(tmp);
        // hidden behind the globe? (segment camera -> object passes within 1 unit of the center)
        const d = tmp.clone().sub(cam), t = Math.min(1, Math.max(0, -cam.dot(d) / d.lengthSq()));
        if (cam.clone().addScaledVector(d, t).length() < 1) continue;
        const v = tmp.clone().project(camera);
        if (v.z > 1) continue;
        const dx = ((v.x + 1) / 2) * innerWidth - x, dy = ((1 - v.y) / 2) * innerHeight - y, dist = dx * dx + dy * dy;
        const key = (o.prio ?? 0) * 1e9 + dist;
        if (dist <= o.radius ** 2 && key < bd) { bd = key; best = o; }
      }
      return best ? best.html() : null;
    },
  };
}
