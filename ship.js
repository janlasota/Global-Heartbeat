// Two little original starfighters that dogfight around the globe. Toggle with the "starfighters" button.
// Pure choreography on a repeating 16 second cycle: they fly free, one chases the other, lasers fly (most miss),
// the chased one dodges with barrel rolls, and one shot lands. Click a ship to make both barrel roll.
import * as THREE from 'three';

const TRAIL = 90; // points kept in each trail
const CYCLE = 16; // seconds per round, the chaser swaps every round
const LAG = 0.75; // how far behind (in path time) the chaser follows
const BOLT_SPEED = 4;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dark = new THREE.MeshBasicMaterial({ color: 0x0b1a2a, side: THREE.DoubleSide });

const tri = (pts) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.computeVertexNormals();
  return g;
};

// slide a point along a great circle toward another, blending the height too (a straight line would cut through the Earth)
const sph = (a, b, w) => {
  const q = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
  const part = new THREE.Quaternion().slerp(q, w);
  return a.clone().normalize().applyQuaternion(part).multiplyScalar(a.length() + (b.length() - a.length()) * w);
};

function makeFighter(color, rgb, path) {
  const ship = new THREE.Group(); // placed and aimed along the path
  const body = new THREE.Group(); // child that rolls about the flight direction
  ship.add(body);
  const hull = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const line = new THREE.LineBasicMaterial({ color });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 8).rotateX(Math.PI / 2), hull);
  nose.position.z = 0.02;
  body.add(nose);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(tri([[0.02 * side, 0, 0.05], [0.15 * side, 0, -0.1], [0.02 * side, 0, -0.07]]), dark);
    body.add(wing, new THREE.LineSegments(new THREE.EdgesGeometry(wing.geometry), line));
  }
  const fin = new THREE.Mesh(tri([[0, 0, -0.02], [0, 0.07, -0.09], [0, 0, -0.09]]), dark);
  body.add(fin, new THREE.LineSegments(new THREE.EdgesGeometry(fin.geometry), line));

  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  const css = `${rgb.map((v) => Math.round(v * 255)).join(',')}`;
  g.addColorStop(0, `rgba(${css},1)`); g.addColorStop(1, `rgba(${css},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.14);
  glow.position.z = -0.1;
  body.add(glow);

  // fading trail: vertex colors fade to black, additive blending turns that into transparency
  const trailPos = new Float32Array(TRAIL * 3), trailCol = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  trail.frustumCulled = false;

  return { ship, body, trail, trailPos, trailCol, trailGeo, rgb, path, color, rollLeft: 0, nextRoll: 3 + Math.random() * 5, dead: 0, seeded: false };
}

export function initShip(scene, camera, toVec3, sfx = {}) {
  const A = makeFighter(0x00f0ff, [0, 0.94, 1], (t) => toVec3(58 * Math.sin(t * 0.31), t * 40, 1.6 + 0.18 * Math.sin(t * 0.7)));
  const B = makeFighter(0xff2e93, [1, 0.18, 0.58], (t) => toVec3(-52 * Math.sin(t * 0.27 + 1.3), t * 36 + 130, 1.55 + 0.2 * Math.sin(t * 0.6 + 2)));
  const fighters = [A, B];
  const root = new THREE.Group();
  for (const f of fighters) root.add(f.ship, f.trail);
  root.visible = false;
  scene.add(root);

  // laser bolts (a small pool) and explosions (one burst per ship)
  const boltGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6);
  const boltMats = new Map(fighters.map((f) => [f, new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })]));
  const bolts = Array.from({ length: 10 }, () => {
    const mesh = new THREE.Mesh(boltGeo, boltMats.get(A));
    mesh.visible = false;
    root.add(mesh);
    return { mesh, dir: new THREE.Vector3(), age: 0, life: 1, hitAt: null, victim: null };
  });
  const burstOf = new Map(fighters.map((f) => {
    const pos = new Float32Array(40 * 3), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: f.color, size: 3, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false;
    pts.visible = false;
    root.add(pts);
    return [f, { pts, pos, geo, vel: Array.from({ length: 40 }, () => new THREE.Vector3()), age: -1 }];
  }));

  let time = 0, on = false, hitCycle = -1, fireTimer = 0;
  const tmp = new THREE.Vector3(), cam = new THREE.Vector3();

  // positions of both ships at path time t, including the chase
  const positions = (t) => {
    const cyc = Math.floor(t / CYCLE), tc = t - cyc * CYCLE;
    const w = smooth(2, 4, tc) * (1 - smooth(12, 14, tc)); // 0 = flying free, 1 = locked on behind the leader
    const chaserIsB = cyc % 2 === 0;
    const [ch, ld] = chaserIsB ? [B, A] : [A, B];
    const lagged = ld.path(t - LAG).multiplyScalar(1 + 0.03 * Math.sin(3 * t));
    const chPos = w > 0 ? sph(ch.path(t), lagged, w) : ch.path(t);
    return { A: chaserIsB ? A.path(t) : chPos, B: chaserIsB ? chPos : B.path(t), ch, ld, cyc, tc };
  };

  const fire = (s, hit) => {
    const bolt = bolts.find((b) => !b.mesh.visible);
    if (!bolt) return;
    const from = s.ch === A ? s.pa : s.pb;
    const tau0 = from.distanceTo(s.ld.path(time)) / BOLT_SPEED;
    const target = s.ld.path(time + tau0); // lead the target
    if (!hit) target.add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.14 + Math.random() * 0.12));
    bolt.dir.copy(target).sub(from).normalize();
    bolt.mesh.position.copy(from).addScaledVector(bolt.dir, 0.1);
    bolt.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bolt.dir);
    bolt.mesh.material = boltMats.get(s.ch);
    bolt.mesh.visible = true;
    sfx.fire?.(from);
    bolt.age = 0;
    bolt.victim = s.ld;
    bolt.hitAt = hit ? from.distanceTo(target) / BOLT_SPEED : null;
    if (!hit && s.ld.rollLeft <= 0 && Math.random() < 0.5) s.ld.rollLeft = 1; // dodge
  };

  const explode = (f) => {
    const b = burstOf.get(f);
    for (let i = 0; i < 40; i++) {
      b.pos.set(f.ship.position.toArray(), i * 3);
      b.vel[i].set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.3 + Math.random() * 0.9);
    }
    b.age = 0;
    b.pts.visible = true;
    f.dead = 1.4;
    sfx.boom?.(f.ship.position);
    f.ship.visible = false;
    f.trail.visible = false;
  };

  const place = (f, p, n, dt) => {
    f.ship.position.copy(p);
    f.ship.up.copy(p).normalize(); // "up" for the ship is away from the Earth
    f.ship.lookAt(n);
    f.nextRoll -= dt;
    if (f.nextRoll <= 0) { f.nextRoll = 8 + Math.random() * 10; f.rollLeft = Math.max(f.rollLeft, 1); }
    if (f.rollLeft > 0) {
      if (!f.rolling) sfx.roll?.(p); // a roll just started
      f.rolling = true;
      f.rollLeft = Math.max(0, f.rollLeft - dt / 0.9); // one full barrel roll in 0.9 seconds
      f.body.rotation.z = (1 - f.rollLeft) * Math.PI * 2;
    } else { f.body.rotation.z = 0; f.rolling = false; }
    f.trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
    f.trailPos.set(p.toArray(), 0);
    for (let i = 0; i < TRAIL; i++) {
      const k = (1 - i / TRAIL) ** 2;
      f.trailCol[i * 3] = f.rgb[0] * k; f.trailCol[i * 3 + 1] = f.rgb[1] * k; f.trailCol[i * 3 + 2] = f.rgb[2] * k;
    }
    f.trailGeo.attributes.position.needsUpdate = true;
    f.trailGeo.attributes.color.needsUpdate = true;
  };

  return {
    get on() { return on; },
    set(v) { on = v; root.visible = v; if (v) for (const f of fighters) f.seeded = false; },
    roll() { for (const f of fighters) if (f.rollLeft <= 0) f.rollLeft = 1; },
    update(dt) {
      if (!on) return;
      time += dt;
      const s = positions(time), next = positions(time + 0.05);
      s.pa = s.A; s.pb = s.B;
      for (const [f, p, n] of [[A, s.A, next.A], [B, s.B, next.B]]) {
        if (f.dead > 0) {
          f.dead -= dt;
          if (f.dead <= 0) { f.ship.visible = true; f.trail.visible = true; f.seeded = false; }
          else continue;
        }
        if (!f.seeded) { for (let i = 0; i < TRAIL; i++) f.trailPos.set(p.toArray(), i * 3); f.seeded = true; } // no streak from the origin
        place(f, p, n, dt);
      }
      // the chaser fires while locked on, and one shot per round lands
      fireTimer -= dt;
      if (s.tc > 4 && s.tc < 12 && fireTimer <= 0 && s.ld.dead <= 0) { fire(s, false); fireTimer = 0.5 + Math.random() * 0.5; }
      if (s.tc >= 10.5 && hitCycle !== s.cyc && s.ld.dead <= 0) { hitCycle = s.cyc; fire(s, true); }
      for (const b of bolts) {
        if (!b.mesh.visible) continue;
        b.age += dt;
        b.mesh.position.addScaledVector(b.dir, BOLT_SPEED * dt);
        if (b.hitAt !== null && b.age >= b.hitAt) { b.hitAt = null; b.mesh.visible = false; if (b.victim.dead <= 0) explode(b.victim); }
        else if (b.age > b.life) b.mesh.visible = false;
      }
      for (const b of burstOf.values()) {
        if (b.age < 0) continue;
        b.age += dt;
        for (let i = 0; i < 40; i++) { b.pos[i * 3] += b.vel[i].x * dt; b.pos[i * 3 + 1] += b.vel[i].y * dt; b.pos[i * 3 + 2] += b.vel[i].z * dt; }
        b.geo.attributes.position.needsUpdate = true;
        b.pts.material.opacity = Math.max(0, 1 - b.age / 0.9);
        if (b.age > 0.9) { b.age = -1; b.pts.visible = false; }
      }
    },
    // is a ship under (x, y) on screen, and not hidden behind the globe?
    pick(x, y) {
      if (!on) return false;
      cam.copy(camera.position);
      return fighters.some((f) => {
        if (f.dead > 0) return false;
        tmp.copy(f.ship.position);
        const d = tmp.clone().sub(cam), t = Math.min(1, Math.max(0, -cam.dot(d) / d.lengthSq()));
        if (cam.clone().addScaledVector(d, t).length() < 1) return false;
        const v = tmp.project(camera);
        return v.z <= 1 && (((v.x + 1) / 2) * innerWidth - x) ** 2 + (((1 - v.y) / 2) * innerHeight - y) ** 2 <= 28 ** 2;
      });
    },
  };
}
