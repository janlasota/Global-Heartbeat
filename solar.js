// The solar system, inside the same scene as the globe: zoom out past the sky and the planets fade in around the Earth.
// Positions are real for the chosen date, but distances are squashed (square root of the real distance) and the planets
// are enlarged, or it would be mostly empty space. The Earth stays at the origin, so the globe IS the Earth.
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';

const BODIES = [
  { name: 'Mercury', color: 0xb5a89a, r: 0.45, period: 88, year: '88 days', moons: 'none', fact: 'Sunrise to sunrise takes 176 Earth days, twice as long as its year.' },
  { name: 'Venus', color: 0xe8c47a, r: 0.9, period: 225, year: '225 days', moons: 'none', fact: 'It spins backwards, and it is hotter than Mercury because of its thick clouds.' },
  { name: 'Mars', color: 0xd9603b, r: 0.6, period: 687, year: '687 days', moons: '2', fact: 'Home to Olympus Mons, the tallest volcano known in the solar system.' },
  { name: 'Jupiter', color: 0xd8b48c, r: 2.2, period: 4333, year: '11.9 years', moons: '90+ known', fact: 'The Great Red Spot is a storm wider than the Earth.' },
  { name: 'Saturn', color: 0xe6d29a, r: 1.9, period: 10759, year: '29.4 years', moons: '140+ known', fact: 'It is less dense than water, so it would float in a big enough bathtub.', ring: true },
  { name: 'Uranus', color: 0x8fe3e6, r: 1.4, period: 30687, year: '84 years', moons: '28', fact: 'Tipped on its side, so each pole gets 42 years of daylight in a row.' },
  { name: 'Neptune', color: 0x4a6bff, r: 1.4, period: 60190, year: '165 years', moons: '16', fact: 'Its winds are the fastest in the solar system, faster than the speed of sound.' },
];
const DAY = 86400000, K = 7; // displayed distance from the Sun = K * sqrt(AU)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// heliocentric position (AU, J2000 equator) -> scene position in the same frame the sky uses (toVec3 of ra/dec), distance squashed
function helio(name, date, out) {
  const v = Astronomy.HelioVector(Astronomy.Body[name], date), au = Math.hypot(v.x, v.y, v.z), s = (K * Math.sqrt(au)) / au;
  return { pos: out.set(v.y * s, v.z * s, v.x * s), au };
}

function label(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '28px ui-monospace, Menlo, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#cfe9ff';
  g.fillText(text, 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, sizeAttenuation: false }));
  sp.scale.set(0.16, 0.04, 1);
  sp.center.set(0.5, -0.5);
  sp.renderOrder = 5;
  return sp;
}

export function initSolar({ scene, camera, controls, getNow, calm }) {
  const root = new THREE.Group(); // turns with the Earth, like the stars
  const inner = new THREE.Group(); // shifted so the Earth sits at the origin
  const content = new THREE.Group(); // everything visible, so it can be hidden without touching the light
  root.add(inner);
  inner.add(content);
  scene.add(root);

  const fades = []; // [material, base opacity]
  const fade = (m, o = 1) => { m.transparent = true; fades.push([m, o]); return m; };

  const sun = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 24), fade(new THREE.MeshBasicMaterial({ color: 0xffc94a })));
  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  const gg = gc.getContext('2d'), grad = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,200,80,0.9)'); grad.addColorStop(0.3, 'rgba(255,170,40,0.25)'); grad.addColorStop(1, 'rgba(255,150,0,0)');
  gg.fillStyle = grad; gg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(fade(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false })));
  glow.scale.setScalar(16);
  sun.add(glow, label('Sun'));
  content.add(sun);
  const light = new THREE.PointLight(0xffffff, 0, 0, 0); // off unless we're far out, so it never touches the Moon or the ships
  inner.add(light);

  const earthAnchor = new THREE.Object3D(); // the Earth is the globe itself, this just gives it a place to click and fly to
  const earthLabel = label('Earth');
  earthLabel.center.set(0.5, -1.6);
  root.add(earthAnchor, earthLabel);
  fade(earthLabel.material);

  const targets = [
    { name: 'Earth', obj: earthAnchor, hit: 1, dist: 3.2, minD: 1.6, au: 1, year: '365.25 days', moons: '1', fact: 'The only place we know of with life, and where you are right now.' },
    { name: 'Sun', obj: sun, hit: 2.6, dist: 22, minD: 5, fact: 'It holds 99.8% of all the mass in the solar system.' },
  ];
  const bodyPos = new THREE.Vector3(), t0 = getNow();
  for (const d of BODIES) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(d.r, 32, 24), fade(new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.9, emissive: d.color, emissiveIntensity: 0.12 })));
    if (d.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(d.r * 1.35, d.r * 2.3, 64), fade(new THREE.MeshBasicMaterial({ color: 0xd8c9a0, side: THREE.DoubleSide, opacity: 0.6 }), 0.6));
      ring.rotation.x = Math.PI / 2 - 0.47;
      mesh.add(ring);
    }
    mesh.add(label(d.name));
    content.add(mesh);
    const pts = [];
    for (let i = 0; i <= 160; i++) pts.push(helio(d.name, new Date(t0.getTime() + (d.period * DAY * i) / 160), bodyPos).pos.clone());
    content.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fade(new THREE.LineBasicMaterial({ color: 0x00f0ff, opacity: 0.22 }), 0.22)));
    targets.push({ ...d, obj: mesh, hit: Math.max(d.r, 1.2), dist: d.r * 5 + 4, minD: d.r * 2.2 + 0.5, au: 0 });
  }
  // Earth's own orbit, which passes through the globe
  {
    const pts = [];
    for (let i = 0; i <= 160; i++) pts.push(helio('Earth', new Date(t0.getTime() + (365.25 * DAY * i) / 160), bodyPos).pos.clone());
    content.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fade(new THREE.LineBasicMaterial({ color: 0x00f0ff, opacity: 0.22 }), 0.22)));
  }

  // ---- controls ----
  const ui = document.createElement('div');
  ui.id = 'solar';
  ui.hidden = true;
  ui.innerHTML = `<div class="s-info" hidden></div><div class="s-bar"></div>
    <div class="s-time"><button class="play">play</button><input type="range" min="-3650" max="3650" step="1" value="0" aria-label="Date offset in days"><span></span><button class="now">now</button></div>`;
  document.body.append(ui);
  const bar = ui.querySelector('.s-bar'), info = ui.querySelector('.s-info');
  const slider = ui.querySelector('input'), dateEl = ui.querySelector('.s-time span'), playBtn = ui.querySelector('.play');
  for (const t of targets) {
    const b = document.createElement('button');
    b.textContent = t.name;
    b.onclick = () => focus(t);
    bar.append(b);
  }

  let f = 0, offset = 0, playing = false, followed = null, fly = null, shown = null, lastPlace = -1e9, lastFar = false;
  const v3 = new THREE.Vector3(), now0 = () => new Date(getNow().getTime() + offset * DAY);

  function showInfo(t) {
    info.innerHTML = t.name === 'Sun'
      ? `<b>Sun</b><div>${t.fact}</div><div>Its light takes 8.3 minutes to reach the Earth.</div>`
      : `<b>${t.name}</b><div>${t.au.toFixed(2)} AU from the Sun right now.${t.name === 'Earth' ? '' : ` Its light takes ${(t.au * 8.317).toFixed(1)} minutes to get there.`}</div><div>One year: ${t.year}. Moons: ${t.moons}.</div><div>${t.fact}</div>`;
    info.hidden = false;
    shown = t;
  }
  function focus(t, overview) {
    followed = t.name === 'Earth' ? null : t;
    controls.minDistance = t.minD;
    controls.autoRotate = false;
    let dir = camera.position.clone().sub(controls.target).normalize();
    if (t.name === 'Earth' && camera.position.length() < 6) dir = camera.position.clone().normalize();
    let dist = t.dist;
    if (overview) { // look down on the orbits from above the ecliptic, with the Sun in the middle
      dir = new THREE.Vector3(-0.398 * 0.8, 0.917 * 0.8, 0.6).normalize().applyQuaternion(root.quaternion);
      dist = 85;
    }
    fly = { t: 0, from: camera.position.clone(), fromTarget: controls.target.clone(), dir, dist };
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === t.name));
    showInfo(t);
  }
  function setDate() {
    const d = now0();
    for (const t of targets) if (t.name !== 'Sun' && t.name !== 'Earth') t.au = helio(t.name, d, t.obj.position).au;
    const e = helio('Earth', d, v3);
    targets[0].au = e.au;
    inner.position.copy(v3).negate();
    sun.position.set(0, 0, 0);
    dateEl.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    slider.value = offset;
    if (shown && !info.hidden) showInfo(shown);
  }
  slider.oninput = () => { offset = +slider.value; setDate(); };
  playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? 'pause' : 'play'; };
  ui.querySelector('.now').onclick = () => { offset = 0; setDate(); };
  setDate();

  function hit(x, y) {
    if (f < 0.4) return null;
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    let best = null, bd = Infinity;
    for (const t of targets) {
      const c = t.obj.getWorldPosition(v3), along = ray.ray.direction.dot(c.clone().sub(ray.ray.origin));
      if (along <= 0) continue;
      const miss = ray.ray.at(along, new THREE.Vector3()).distanceTo(c);
      if (miss <= Math.max(t.hit * 0.9, along * 0.03) && along < bd) { bd = along; best = t; }
    }
    return best;
  }

  return {
    get f() { return f; },
    hit,
    click(x, y) { const t = hit(x, y); if (t) focus(t); return !!t; },
    open() { focus(targets[1], true); }, // the Solar System button: fly out to an overview centered on the Sun
    update(dt) {
      const d = camera.position.length();
      f = smooth(9, 16, d);
      const far = f > 0.4;
      root.rotation.y = -((Astronomy.SiderealTime(getNow()) * 15 * Math.PI) / 180);
      content.visible = earthLabel.visible = f > 0.01;
      light.intensity = far ? 3.2 : 0;
      for (const [m, o] of fades) m.opacity = o * f;
      if (f > 0.01 && camera.far < 1000) { camera.far = 3000; camera.updateProjectionMatrix(); }
      else if (f <= 0.01 && camera.far > 1000) { camera.far = 200; camera.updateProjectionMatrix(); }
      ui.hidden = !far;
      document.body.classList.toggle('space', far);
      if (far !== lastFar && !(fly && !far)) { lastFar = far; if (!far) { controls.minDistance = 1.6; followed = null; fly = null; info.hidden = true; shown = null; bar.querySelectorAll('button').forEach((b) => b.classList.remove('on')); } }
      if (playing) {
        offset = Math.min(3650, offset + dt * (calm ? 15 : 45)); // about a month and a half per second
        if (offset >= 3650) { playing = false; playBtn.textContent = 'play'; }
        setDate();
      }
      // glide to the chosen body, then keep following it as it moves
      const t = fly ? (followed ?? targets[0]) : followed;
      if (fly) {
        const c = (followed ?? targets[0]).obj.getWorldPosition(v3).clone();
        fly.t = Math.min(1, fly.t + dt / (calm ? 0.01 : 1.4));
        const e = fly.t * fly.t * (3 - 2 * fly.t);
        controls.target.lerpVectors(fly.fromTarget, c, e);
        camera.position.lerpVectors(fly.from, c.clone().addScaledVector(fly.dir, fly.dist), e);
        if (fly.t >= 1) fly = null;
      } else if (t) {
        const c = t.obj.getWorldPosition(v3), delta = c.clone().sub(controls.target);
        controls.target.add(delta);
        camera.position.add(delta);
      }
    },
  };
}
