// Satellites circling the globe: space stations and the brightest satellites by name, plus a thinned Starlink swarm.
// Orbits are computed in the browser from CelesTrak orbit data (via /tle) with satellite.js. Loaded on demand from main.js.
import * as THREE from 'three';
import * as sat from 'satellite.js';

const parse = (text) => {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    try { out.push({ name: lines[i].trim(), rec: sat.twoline2satrec(lines[i + 1], lines[i + 2]) }); } catch { /* skip a bad record */ }
  }
  return out;
};

export async function initSats(scene, toVec3, camera) {
  const [stations, visual, starlink] = await Promise.all(['stations', 'visual', 'starlink'].map((g) => fetch(`/tle?group=${g}`).then((r) => (r.ok ? r.text() : ''))).map((p) => p.then(parse)));
  // the ISS already has its own marker, and docked ships would sit on top of it
  const station = stations.filter((s) => !/^(ISS|ZARYA|POISK|NAUKA|PROGRESS|SOYUZ|CREW|CYGNUS|DRAGON|HTV|SPACEX)/i.test(s.name));
  const seen = new Set(station.map((s) => s.name));
  const bright = visual.filter((s) => !seen.has(s.name) && !/^ISS/i.test(s.name));

  const layer = (list, size, color, opacity) => {
    const pos = new Float32Array(list.length * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, color, transparent: true, opacity, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    return { list, pos, pts, geo: g };
  };
  const named = [layer(station, 5, 0xffffff, 1), layer(bright, 3, 0x7fffe8, 0.95)];
  const swarm = layer(starlink, 1.6, 0xff7ac8, 0.5);
  const layers = [...named, swarm];

  const info = []; // per named satellite: latest altitude, for tooltips
  const refresh = (date) => {
    const gmst = sat.gstime(date);
    for (const L of layers) {
      L.list.forEach((s, i) => {
        const pv = sat.propagate(s.rec, date);
        if (!pv.position) { L.pos.set([0, 0, 0], i * 3); return; } // decayed: park it inside the globe
        const gd = sat.eciToGeodetic(pv.position, gmst);
        L.pos.set(toVec3(sat.degreesLat(gd.latitude), sat.degreesLong(gd.longitude), 1 + gd.height / 6371).toArray(), i * 3);
        s.alt = gd.height;
      });
      L.geo.attributes.position.needsUpdate = true;
    }
  };

  let last = 0, on = true;
  const v = new THREE.Vector3(), cam = new THREE.Vector3();
  return {
    set(val) { on = val; for (const L of layers) L.pts.visible = val; },
    update(date) {
      if (!on || date - last < 1000) return; // satellites cover ~7 km a second, once a second looks smooth
      last = +date;
      refresh(date);
    },
    // tooltip html for the satellite under (x, y), or null. Named ones win, then the Starlink swarm.
    pick(x, y) {
      if (!on) return null;
      cam.copy(camera.position);
      const scan = (L, radius) => {
        let best = null, bd = radius * radius;
        L.list.forEach((s, i) => {
          v.fromArray(L.pos, i * 3);
          if (!v.lengthSq()) return;
          const d = v.clone().sub(cam), t = Math.min(1, Math.max(0, -cam.dot(d) / d.lengthSq()));
          if (cam.clone().addScaledVector(d, t).length() < 1) return; // behind the globe
          const p = v.clone().project(camera);
          if (p.z > 1) return;
          const dist = (((p.x + 1) / 2) * innerWidth - x) ** 2 + (((1 - p.y) / 2) * innerHeight - y) ** 2;
          if (dist < bd) { bd = dist; best = s; }
        });
        return best && { s: best, d: bd };
      };
      const hits = named.map((L) => scan(L, 18)).filter(Boolean).sort((a, b) => a.d - b.d);
      const hit = hits[0]?.s ?? scan(swarm, 12)?.s;
      if (!hit) return null;
      const period = (2 * Math.PI) / hit.rec.no; // mean motion is radians per minute
      const html = `<b>${hit.name}</b><br>${Math.round(hit.alt ?? 0)} km up<br>orbits Earth every ${Math.round(period)} min`;
      return starlink.includes(hit) ? `${html}<div class="fact">One of thousands of Starlink internet satellites. About one in four is shown here.</div>` : html;
    },
  };
}
