// Solar System mode: its own canvas and scene on top of the globe (which pauses). Planet positions are real for the chosen date,
// but distances are squashed (square root of the real distance) and the planets are enlarged, or it would be mostly empty space.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Astronomy from 'astronomy-engine';

const BODIES = [
  { name: 'Mercury', b: 'Mercury', color: 0xb5a89a, r: 0.35, year: '88 days', moons: 'none', fact: 'Sunrise to sunrise takes 176 Earth days, twice as long as its year.' },
  { name: 'Venus', b: 'Venus', color: 0xe8c47a, r: 0.6, year: '225 days', moons: 'none', fact: 'It spins backwards, and it is hotter than Mercury because of its thick clouds.' },
  { name: 'Earth', b: 'Earth', color: 0x3d7bff, r: 0.65, year: '365.25 days', moons: '1', fact: 'The only place we know of with life, and where you are right now.' },
  { name: 'Mars', b: 'Mars', color: 0xd9603b, r: 0.45, year: '687 days', moons: '2', fact: 'Home to Olympus Mons, the tallest volcano known in the solar system.' },
  { name: 'Jupiter', b: 'Jupiter', color: 0xd8b48c, r: 1.6, year: '11.9 years', moons: '90+ known', fact: 'The Great Red Spot is a storm wider than the Earth.' },
  { name: 'Saturn', b: 'Saturn', color: 0xe6d29a, r: 1.4, year: '29.4 years', moons: '140+ known', fact: 'It is less dense than water, so it would float in a big enough bathtub.', ring: true },
  { name: 'Uranus', b: 'Uranus', color: 0x8fe3e6, r: 1.0, year: '84 years', moons: '28', fact: 'Tipped on its side, so each pole gets 42 years of daylight in a row.' },
  { name: 'Neptune', b: 'Neptune', color: 0x4a6bff, r: 1.0, year: '165 years', moons: '16', fact: 'Its winds are the fastest in the solar system, faster than the speed of sound.' },
];
const SUN = { name: 'Sun', color: 0xffc94a, r: 2.6, fact: 'It holds 99.8% of all the mass in the solar system.' };
const DAY = 86400000, EPS = THREE.MathUtils.degToRad(23.4393);
const K = 7; // distance squash: displayed = K * sqrt(AU)

// heliocentric position (AU, J2000 equator) -> scene position, tipped onto the ecliptic so the orbits lie flat
function place(b, date, out) {
  const v = Astronomy.HelioVector(Astronomy.Body[b], date);
  const y = v.y * Math.cos(EPS) + v.z * Math.sin(EPS), z = -v.y * Math.sin(EPS) + v.z * Math.cos(EPS);
  const au = Math.hypot(v.x, y, z), s = (K * Math.sqrt(au)) / au;
  return { pos: out.set(v.x * s, z * s, -y * s), au };
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

export function initSolar(getNow, calm) {
  const cv = document.createElement('canvas');
  cv.id = 'solarcv';
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'The solar system: the Sun and eight planets at their real positions for the chosen date. Use the buttons at the bottom to fly to each one.');
  const ui = document.createElement('div');
  ui.id = 'solar';
  ui.innerHTML = `<button class="back">&larr; Earth</button>
    <div class="s-info" hidden></div>
    <div class="s-bar"></div>
    <div class="s-time"><button class="play">play</button><input type="range" min="-3650" max="3650" step="1" value="0" aria-label="Date offset in days"><span></span><button class="now">now</button></div>`;
  cv.hidden = ui.hidden = true;
  document.body.append(cv, ui);

  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x04050a);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  camera.position.set(0, 40, 75);
  const controls = new OrbitControls(camera, cv);
  controls.enableDamping = true;
  controls.minDistance = 2;
  controls.maxDistance = 220;
  controls.enablePan = false;

  // stars
  const sp = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) new THREE.Vector3().randomDirection().multiplyScalar(900).toArray(sp, i * 3);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe9ff, size: 1.6, sizeAttenuation: false })));

  // the Sun, with a soft glow, lighting everything else
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN.r, 32, 24), new THREE.MeshBasicMaterial({ color: SUN.color }));
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 128;
  const gg = glowC.getContext('2d'), grad = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,200,80,0.9)'); grad.addColorStop(0.3, 'rgba(255,170,40,0.25)'); grad.addColorStop(1, 'rgba(255,150,0,0)');
  gg.fillStyle = grad; gg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowC), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(SUN.r * 6);
  sun.add(glow);
  const sunLabel = label('Sun');
  sun.add(sunLabel);
  scene.add(sun, new THREE.PointLight(0xffffff, 3.2, 0, 0), new THREE.AmbientLight(0x404868, 0.9));

  const targets = [{ ...SUN, mesh: sun, au: 0, hit: SUN.r }];
  for (const d of BODIES) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(d.r, 32, 24), new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.9 }));
    if (d.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(d.r * 1.35, d.r * 2.3, 64), new THREE.MeshBasicMaterial({ color: 0xd8c9a0, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
      ring.rotation.x = Math.PI / 2 - 0.47;
      mesh.add(ring);
    }
    mesh.add(label(d.name));
    scene.add(mesh);
    // orbit line: sample one full lap of the real orbit
    const period = { Mercury: 88, Venus: 225, Earth: 365, Mars: 687, Jupiter: 4333, Saturn: 10759, Uranus: 30687, Neptune: 60190 }[d.b];
    const pts = [], t0 = getNow(), v = new THREE.Vector3();
    for (let i = 0; i <= 160; i++) pts.push(place(d.b, new Date(t0.getTime() + (period * DAY * i) / 160), v).pos.clone());
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.22 })));
    targets.push({ ...d, mesh, au: 0, hit: Math.max(d.r, 1.4) });
  }

  // controls UI
  const bar = ui.querySelector('.s-bar'), info = ui.querySelector('.s-info');
  const slider = ui.querySelector('input'), dateEl = ui.querySelector('.s-time span'), playBtn = ui.querySelector('.play');
  for (const t of targets) {
    const b = document.createElement('button');
    b.textContent = t.name;
    b.onclick = () => focus(t);
    bar.append(b);
  }
  let active = false, raf = 0, last = 0, offset = 0, playing = false, followed = null, fly = null;
  const v3 = new THREE.Vector3();

  function showInfo(t) {
    const light = t.au ? ` Light from the Sun takes ${(t.au * 8.317).toFixed(1)} minutes to get here.` : '';
    info.innerHTML = t.name === 'Sun'
      ? `<b>Sun</b><div>${t.fact}</div><div>Light from it takes 8.3 minutes to reach the Earth.</div>`
      : `<b>${t.name}</b><div>${t.au.toFixed(2)} AU from the Sun right now.${light}</div><div>One year: ${t.year}. Moons: ${t.moons}.</div><div>${t.fact}</div>`;
    info.hidden = false;
  }
  function focus(t) {
    followed = t;
    showInfo(t);
    const dir = camera.position.clone().sub(controls.target).normalize();
    fly = { t: 0, from: camera.position.clone(), fromTarget: controls.target.clone(), dir, dist: t.hit * 5 + 4 };
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === t.name));
  }

  function setDate() {
    const now = new Date(getNow().getTime() + offset * DAY);
    for (const t of targets) if (t.name !== 'Sun') { const p = place(t.b, now, t.mesh.position); t.au = p.au; }
    dateEl.textContent = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    slider.value = offset;
    if (followed && !info.hidden) showInfo(followed);
  }
  slider.oninput = () => { offset = +slider.value; setDate(); };
  playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? 'pause' : 'play'; };
  ui.querySelector('.now').onclick = () => { offset = 0; setDate(); };

  // click a planet to fly to it
  let down = null;
  cv.onpointerdown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  cv.onpointerup = (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    let best = null, bd = Infinity;
    for (const t of targets) {
      const c = t.mesh.getWorldPosition(v3);
      const along = ray.ray.direction.dot(c.clone().sub(ray.ray.origin));
      if (along <= 0) continue;
      const miss = ray.ray.at(along, new THREE.Vector3()).distanceTo(c);
      if (miss <= Math.max(t.hit * 0.8, along * 0.03) && along < bd) { bd = along; best = t; }
    }
    if (best) focus(best);
  };
  cv.onpointermove = (e) => {
    if (e.buttons) return;
    cv.style.cursor = 'grab';
  };

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  function loop(ts) {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min((ts - last) / 1000, 0.1);
    last = ts;
    if (playing) {
      offset = Math.min(3650, offset + dt * (calm ? 15 : 45)); // about a month and a half per second
      if (offset >= 3650) { playing = false; playBtn.textContent = 'play'; }
      setDate();
    }
    sun.rotation.y += dt * 0.1;
    // keep following the chosen body as it moves, and glide the camera over to it after a click
    if (followed) {
      const c = followed.mesh.getWorldPosition(v3);
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / (calm ? 0.01 : 1.4));
        const e = fly.t * fly.t * (3 - 2 * fly.t);
        controls.target.lerpVectors(fly.fromTarget, c, e);
        camera.position.lerpVectors(fly.from, c.clone().addScaledVector(fly.dir, fly.dist), e);
        if (fly.t >= 1) fly = null;
      } else {
        const d = c.clone().sub(controls.target);
        controls.target.add(d);
        camera.position.add(d);
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    get active() { return active; },
    enter() {
      active = true;
      cv.hidden = ui.hidden = false;
      document.body.classList.add('space');
      offset = 0; playing = false; playBtn.textContent = 'play'; followed = null; fly = null; info.hidden = true;
      bar.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
      camera.position.set(0, 40, 75);
      controls.target.set(0, 0, 0);
      setDate();
      resize();
      last = performance.now();
      raf = requestAnimationFrame(loop);
    },
    exit() {
      active = false;
      cancelAnimationFrame(raf);
      cv.hidden = ui.hidden = true;
      document.body.classList.remove('space');
    },
    onBack(fn) { ui.querySelector('.back').onclick = fn; },
  };
}
