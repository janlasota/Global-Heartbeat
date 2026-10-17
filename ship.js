// A little original starfighter that flies loops around the globe. Toggle with the "starfighter" button.
// It barrel-rolls every so often, and whenever you click it.
import * as THREE from 'three';

const TRAIL = 90; // points kept in the trail

export function initShip(scene, camera, toVec3) {
  const ship = new THREE.Group(); // positioned and aimed along the path
  const body = new THREE.Group(); // child that does the barrel roll about the flight direction
  ship.add(body);

  const cyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
  const dark = new THREE.MeshBasicMaterial({ color: 0x0b1a2a, side: THREE.DoubleSide });

  // fuselage: a cone lying along +Z (the direction of flight)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 8).rotateX(Math.PI / 2), cyan);
  nose.position.z = 0.02;
  body.add(nose);

  // swept wings (two triangles each side) and a tail fin
  const tri = (pts) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.computeVertexNormals();
    return g;
  };
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(tri([[0.02 * side, 0, 0.05], [0.15 * side, 0, -0.1], [0.02 * side, 0, -0.07]]), dark);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(wing.geometry), new THREE.LineBasicMaterial({ color: 0x00f0ff }));
    body.add(wing, edge);
  }
  const fin = new THREE.Mesh(tri([[0, 0.0, -0.02], [0, 0.07, -0.09], [0, 0, -0.09]]), dark);
  body.add(fin, new THREE.LineSegments(new THREE.EdgesGeometry(fin.geometry), new THREE.LineBasicMaterial({ color: 0x00f0ff })));

  // engine glow
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,90,170,1)'); g.addColorStop(1, 'rgba(255,46,147,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.14);
  glow.position.z = -0.1;
  body.add(glow);

  // fading trail (vertex colors fade to black, additive blending turns that into transparency)
  const trailPos = new Float32Array(TRAIL * 3), trailCol = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  trail.frustumCulled = false;

  const root = new THREE.Group();
  root.add(ship, trail);
  root.visible = false;
  scene.add(root);

  // the flight path: a wandering loop around the globe, slightly above the surface
  const at = (t) => toVec3(58 * Math.sin(t * 0.31), t * 40, 1.6 + 0.18 * Math.sin(t * 0.7)); // lat, lon in degrees
  let t = 0, rollLeft = 0, nextRoll = 6 + Math.random() * 8, on = false, seeded = false;
  const next = new THREE.Vector3(), tmp = new THREE.Vector3(), cam = new THREE.Vector3();

  const reset = () => { // fill the trail with the current position so it doesn't streak in from the origin
    const p = at(t);
    for (let i = 0; i < TRAIL; i++) trailPos.set(p.toArray(), i * 3);
    seeded = true;
  };

  return {
    get on() { return on; },
    set(v) { on = v; root.visible = v; if (v) seeded = false; },
    roll() { if (rollLeft <= 0) rollLeft = 1; },
    update(dt) {
      if (!on) return;
      if (!seeded) reset();
      t += dt;
      const p = at(t), n = at(t + 0.05);
      ship.position.copy(p);
      ship.up.copy(p).normalize(); // "up" for the ship is away from the Earth
      ship.lookAt(next.copy(n));
      nextRoll -= dt;
      if (nextRoll <= 0) { nextRoll = 8 + Math.random() * 10; rollLeft = 1; }
      if (rollLeft > 0) {
        rollLeft = Math.max(0, rollLeft - dt / 0.9); // one full barrel roll in 0.9 seconds
        body.rotation.z = (1 - rollLeft) * Math.PI * 2;
      } else body.rotation.z = 0;
      // slide the trail along
      trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
      trailPos.set(p.toArray(), 0);
      for (let i = 0; i < TRAIL; i++) {
        const f = (1 - i / TRAIL) ** 2;
        trailCol[i * 3] = 1 * f; trailCol[i * 3 + 1] = 0.18 * f; trailCol[i * 3 + 2] = 0.58 * f;
      }
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.color.needsUpdate = true;
    },
    // is the ship under (x, y) on screen, and not hidden behind the globe?
    pick(x, y) {
      if (!on) return false;
      cam.copy(camera.position);
      tmp.copy(ship.position);
      const d = tmp.clone().sub(cam), s = Math.min(1, Math.max(0, -cam.dot(d) / d.lengthSq()));
      if (cam.clone().addScaledVector(d, s).length() < 1) return false;
      const v = tmp.project(camera);
      if (v.z > 1) return false;
      return (((v.x + 1) / 2) * innerWidth - x) ** 2 + (((1 - v.y) / 2) * innerHeight - y) ** 2 <= 28 ** 2;
    },
  };
}
