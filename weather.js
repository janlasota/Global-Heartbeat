// Current weather from Open-Meteo (free, no key, CORS ok). One request per city, cached 10 min.
const WMO = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail',
};

export async function loadWeather(c) {
  if (c.wx && Date.now() - c.wxAt < 600000) return;
  c.wxErr = false;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code,wind_speed_10m`);
    if (!r.ok) throw new Error(r.status);
    const w = (await r.json()).current;
    c.wx = { t: w.temperature_2m, code: w.weather_code, wind: w.wind_speed_10m };
    c.wxAt = Date.now();
  } catch (e) { c.wxErr = true; console.warn('weather', c.name, e.message); }
}

export function wxText(c) {
  const w = c.wx;
  return `${WMO[w.code] ?? 'Unknown'} \u00b7 ${Math.round(w.t)}\u00b0C / ${Math.round((w.t * 9) / 5 + 32)}\u00b0F \u00b7 wind ${Math.round(w.wind)} km/h`;
}

// Air quality (US AQI) from Open-Meteo's air-quality API; same caching as weather.
const AQI = [[50, 'Good'], [100, 'Moderate'], [150, 'Unhealthy for sensitive groups'], [200, 'Unhealthy'], [300, 'Very unhealthy'], [Infinity, 'Hazardous']];

export async function loadAqi(c) {
  if (c.aqi != null && Date.now() - c.aqiAt < 600000) return;
  c.aqiErr = false;
  try {
    const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lon}&current=us_aqi`);
    if (!r.ok) throw new Error(r.status);
    c.aqi = (await r.json()).current.us_aqi;
    if (c.aqi == null) throw new Error('no data');
    c.aqiAt = Date.now();
  } catch (e) { c.aqiErr = true; c.aqi = null; console.warn('aqi', c.name, e.message); }
}

export const aqiText = (c) => `Air quality ${Math.round(c.aqi)} · ${AQI.find(([max]) => c.aqi <= max)[1]}`;
