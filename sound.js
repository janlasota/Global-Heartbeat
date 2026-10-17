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
export const toggleMute = () => (muted = !muted);
