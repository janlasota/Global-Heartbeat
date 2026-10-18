// Synthesized lub-dub (no audio files). Browsers need a user gesture before audio can start.
let ac;
let muted = false;
export const unlock = () => { ac ??= new AudioContext(); if (ac.state === 'suspended') ac.resume(); };

function thump(freq, vol) {
  if (!ac || muted || ac.state !== 'running') return;
  const t = ac.currentTime, g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  g.connect(ac.destination);
  // low body + a quiet higher partial so it's audible on laptop/phone speakers
  for (const [f, v] of [[freq, 1], [freq * 2, 0.35]]) {
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.2);
    og.gain.value = v;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 0.25);
  }
}
export const lub = () => thump(105, 0.5);
export const dub = () => thump(130, 0.3);

// ---- starfighter sound effects, all synthesized ----
const ENGINE_VOL = 0.03;
let engine = null;
let noise = null; // a second of white noise, reused for explosions and whooshes

const noiseBuf = () => {
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
};
// route a sound to the speakers, panned left (-1) to right (1)
const out = (pan) => {
  const p = ac.createStereoPanner();
  p.pan.value = pan;
  p.connect(ac.destination);
  return p;
};
const live = () => ac && !muted && ac.state === 'running';

// "pew": a quick drop in pitch
export function laser(pan = 0) {
  if (!live()) return;
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(1100, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.16);
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g).connect(out(pan));
  o.start(t);
  o.stop(t + 0.2);
}

// explosion: a rumble of noise that closes down, plus a low thump
export function boom(pan = 0) {
  if (!live()) return;
  const t = ac.currentTime, n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuf();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(1400, t);
  f.frequency.exponentialRampToValueAtTime(70, t + 0.9);
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1);
  const dest = out(pan);
  n.connect(f).connect(g).connect(dest);
  n.start(t);
  n.stop(t + 1);
  const o = ac.createOscillator(), og = ac.createGain();
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
  og.gain.setValueAtTime(0.4, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  o.connect(og).connect(dest);
  o.start(t);
  o.stop(t + 0.6);
}

// barrel roll: a short sweep of filtered noise
export function whoosh(pan = 0) {
  if (!live()) return;
  const t = ac.currentTime, n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuf();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(350, t);
  f.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.8);
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  n.connect(f).connect(g).connect(out(pan));
  n.start(t);
  n.stop(t + 0.9);
}

// a quiet engine hum while the starfighters are flying
export function engineOn(on) {
  if (!ac) return;
  if (on && !engine) {
    const g = ac.createGain(), lp = ac.createBiquadFilter(), lfo = ac.createOscillator(), lfoGain = ac.createGain();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(muted ? 0 : ENGINE_VOL, ac.currentTime + 0.6);
    const oscs = [62, 64.3].map((hz) => { // two slightly different pitches beat against each other
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      lfoGain.connect(o.frequency);
      o.connect(lp);
      o.start();
      return o;
    });
    lfo.frequency.value = 0.35; // slow wobble in pitch
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain);
    lfo.start();
    lp.connect(g).connect(ac.destination);
    engine = { g, stop: () => [...oscs, lfo].forEach((o) => o.stop()) };
  } else if (!on && engine) {
    const e = engine;
    engine = null;
    e.g.gain.cancelScheduledValues(ac.currentTime);
    e.g.gain.setValueAtTime(e.g.gain.value, ac.currentTime);
    e.g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
    setTimeout(e.stop, 500);
  }
}

export const toggleMute = () => {
  muted = !muted;
  if (engine) engine.g.gain.setTargetAtTime(muted ? 0 : ENGINE_VOL, ac.currentTime, 0.05);
  return muted;
};
