// "Tonight in <city>": what the sky does at this spot. Computed in the browser with astronomy-engine, no data requests.
import * as A from 'astronomy-engine';

const PHASES = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
const NAKED_EYE = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

export function tonight(c, now = new Date()) {
  const obs = new A.Observer(c.lat, c.lon, 0);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: 'numeric', minute: '2-digit' });
  const day = new Intl.DateTimeFormat('en-US', { timeZone: c.tz, month: 'short', day: 'numeric', year: 'numeric' });
  const when = (t) => time.format(t);
  const alt = (body, date) => {
    const eq = A.Equator(body, date, obs, true, true);
    return A.Horizon(date, obs, eq.ra, eq.dec, 'normal').altitude;
  };
  const next = (body, dir) => A.SearchRiseSet(body, obs, dir, now, 2)?.date;
  const rows = [];

  // sun
  const sunAlt = alt('Sun', now);
  const night = sunAlt < -6; // dark enough to see planets
  const sunEvent = sunAlt > -0.83 ? ['Sunset', next('Sun', -1)] : ['Sunrise', next('Sun', 1)];
  rows.push(`${sunAlt > -0.83 ? 'Daytime' : night ? 'Night' : 'Twilight'}${sunEvent[1] ? `, ${sunEvent[0].toLowerCase()} ${when(sunEvent[1])}` : ''}`);

  // moon
  const phase = A.MoonPhase(now), lit = Math.round(A.Illumination('Moon', now).phase_fraction * 100);
  const moonUp = alt('Moon', now) > -0.5;
  const moonEvent = moonUp ? ['sets', next('Moon', -1)] : ['rises', next('Moon', 1)];
  rows.push(`${PHASES[Math.round(phase / 45) % 8]}, ${lit}% lit, ${moonUp ? 'up now' : 'below the horizon'}${moonEvent[1] ? `, ${moonEvent[0]} ${when(moonEvent[1])}` : ''}`);

  // planets (only meaningful once the sky is dark)
  if (night) {
    const up = NAKED_EYE.filter((p) => alt(p, now) > 5);
    rows.push(up.length ? `Planets up now: ${up.join(', ')}` : 'No bright planets above the horizon');
  } else rows.push('Planets show up after dark');

  // eclipses
  let lunar = A.SearchLunarEclipse(now), seen = null;
  for (let i = 0; i < 8 && !seen; i++) { // next one whose peak happens with the Moon above the horizon here
    if (alt('Moon', lunar.peak.date) > 0) seen = lunar;
    else lunar = A.NextLunarEclipse(lunar.peak);
  }
  if (seen) rows.push(`Next lunar eclipse you can see: ${day.format(seen.peak.date)} (${seen.kind})`);
  try {
    const sol = A.SearchLocalSolarEclipse(now, obs);
    rows.push(`Next solar eclipse here: ${day.format(sol.peak.time.date)} (${sol.kind})`);
  } catch { /* none found in the search window */ }

  return `<b>Tonight in ${c.name}</b>${rows.map((r) => `<div>${r}</div>`).join('')}`;
}
