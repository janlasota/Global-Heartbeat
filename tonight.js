// "Tonight in <city>": a small card with the real Moon phase drawn as a picture, plus the one or two facts worth knowing.
// Computed in the browser with astronomy-engine, no data requests.
import * as A from 'astronomy-engine';

const PHASES = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
const NAKED_EYE = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
const SOON_DAYS = 60; // eclipses only get a line when one is this close

// The Moon as it looks tonight. angle is the Moon's phase angle (0 new, 180 full).
// Lit side flips for the southern hemisphere, where the Moon appears turned around.
function moonSvg(angle, southern) {
  const r = 22, rad = (angle * Math.PI) / 180, waxing = angle < 180;
  const xt = r * Math.cos(rad); // where the day/night line crosses the middle of the disc
  const rx = Math.abs(xt).toFixed(2);
  // right half-circle, then back along the terminator (an ellipse) to the top
  const lit = `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${xt > 0 ? 0 : 1} 0 ${-r} Z`;
  const flip = waxing === southern ? ' scale(-1 1)' : '';
  return `<svg class="moon" viewBox="-25 -25 50 50" width="46" height="46" aria-hidden="true">`
    + `<circle r="${r}" fill="#141b2a" stroke="rgba(0,240,255,0.5)" stroke-width="1"/>`
    + `<path d="${lit}" fill="#e8edf6" transform="${flip}"/></svg>`;
}

export function tonight(c, now = new Date()) {
  const obs = new A.Observer(c.lat, c.lon, 0);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hour: 'numeric', minute: '2-digit' });
  const dayShort = new Intl.DateTimeFormat('en-US', { timeZone: c.tz, month: 'short', day: 'numeric' });
  const dayLong = new Intl.DateTimeFormat('en-US', { timeZone: c.tz, month: 'short', day: 'numeric', year: 'numeric' });
  const daysAway = (d) => Math.max(0, Math.ceil((d - now) / 86400000));
  const alt = (body, date) => {
    const eq = A.Equator(body, date, obs, true, true);
    return A.Horizon(date, obs, eq.ra, eq.dec, 'normal').altitude;
  };
  const next = (body, dir) => A.SearchRiseSet(body, obs, dir, now, 2)?.date;
  const lines = [];

  // moon: phase name, how lit, and when it sets or rises
  const angle = A.MoonPhase(now), lit = Math.round(A.Illumination('Moon', now).phase_fraction * 100);
  const moonUp = alt('Moon', now) > -0.5;
  const moonT = next('Moon', moonUp ? -1 : 1);
  const head = PHASES[Math.round(angle / 45) % 8];
  lines.push(`<b>${head}</b>`, `${lit}% lit${moonT ? `, ${moonUp ? 'sets' : 'rises'} ${time.format(moonT)}` : ''}`);

  // sun: where we are in the day
  const sunAlt = alt('Sun', now), sunUp = sunAlt > -0.83;
  const sunT = next('Sun', sunUp ? -1 : 1);
  lines.push(`${sunUp ? 'Daytime' : sunAlt < -6 ? 'Night' : 'Twilight'}${sunT ? `, ${sunUp ? 'sunset' : 'sunrise'} ${time.format(sunT)}` : ''}`);

  // planets, only worth a line when the sky is dark and some are actually up
  if (sunAlt < -6) {
    const up = NAKED_EYE.filter((p) => alt(p, now) > 5);
    if (up.length) lines.push(`Planets up: ${up.join(', ')}`);
  }

  // eclipses, only when one is coming soon
  const soon = (date) => (date - now) / 86400000 <= SOON_DAYS;
  let lunar = A.SearchLunarEclipse(now);
  for (let i = 0; i < 8 && alt('Moon', lunar.peak.date) <= 0; i++) lunar = A.NextLunarEclipse(lunar.peak);
  if (alt('Moon', lunar.peak.date) > 0 && soon(lunar.peak.date)) lines.push(`Lunar eclipse in ${Math.ceil((lunar.peak.date - now) / 86400000)} days (${lunar.kind})`);
  try {
    const sol = A.SearchLocalSolarEclipse(now, obs);
    if (soon(sol.peak.time.date)) lines.push(`Solar eclipse in ${Math.ceil((sol.peak.time.date - now) / 86400000)} days (${sol.kind})`);
  } catch { /* none found in the search window */ }

  // ---- full details, shown when hovering the Moon picture ----
  const rows = [];
  const full = A.SearchMoonPhase(180, now, 40), fresh = A.SearchMoonPhase(0, now, 40);
  if (full) rows.push(`Next full Moon: ${dayShort.format(full.date)} (in ${daysAway(full.date)} days)`);
  if (fresh) rows.push(`Next new Moon: ${dayShort.format(fresh.date)} (in ${daysAway(fresh.date)} days)`);
  const planetRows = NAKED_EYE.map((p) => {
    const isUp = alt(p, now) > 0;
    const t = next(p, isUp ? -1 : 1);
    const hidden = isUp && sunAlt > -6 ? ', too bright out to see' : '';
    return `<div>${p}: ${isUp ? 'above the horizon' : 'below the horizon'}${hidden}${t ? `, ${isUp ? 'sets' : 'rises'} ${time.format(t)}` : ''}</div>`;
  });
  let lun = A.SearchLunarEclipse(now);
  for (let i = 0; i < 8 && alt('Moon', lun.peak.date) <= 0; i++) lun = A.NextLunarEclipse(lun.peak);
  const eclipseRows = [];
  if (alt('Moon', lun.peak.date) > 0) eclipseRows.push(`<div>Lunar: ${dayLong.format(lun.peak.date)} (${lun.kind}), in ${daysAway(lun.peak.date)} days</div>`);
  try {
    const sol = A.SearchLocalSolarEclipse(now, obs);
    eclipseRows.push(`<div>Solar: ${dayLong.format(sol.peak.time.date)} (${sol.kind}), in ${daysAway(sol.peak.time.date)} days</div>`);
  } catch { /* none found in the search window */ }
  const details = `<b>Sky details for ${c.name}</b>${rows.map((r) => `<div>${r}</div>`).join('')}`
    + `<div class="fact"><b>Bright planets</b>${planetRows.join('')}</div>`
    + (eclipseRows.length ? `<div class="fact"><b>Next eclipses you can see</b>${eclipseRows.join('')}</div>` : '');

  const card = `<div class="tn-head"><span class="tn-title">Tonight in ${c.name}</span><button class="more">More sky details</button></div><div class="tn-row">${moonSvg(angle, c.lat < 0)}<div>${lines.map((l) => `<div>${l}</div>`).join('')}</div></div>`;
  return { card, details };
}
