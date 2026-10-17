# Global Heartbeat

A fun interactive globe. Cities pulse at a heart rate driven by how busy their skies are, with live layers for
earthquakes, the aurora, the ISS and the night sky. Tap a city to open its weather, air quality, bike-share stations,
live aircraft and rain radar.

No build step. Plain ES modules, three.js from a CDN.

## Run it locally

```
node server.mjs
```

Then open http://localhost:3000. Needs Node 18 or newer. The small server does two jobs the browser can't:
it proxies live aircraft (adsb.lol), bike-share feeds and satellite orbit data, which browsers can't fetch directly, and caches them.

## Deploy

The same routes exist as Vercel functions in `api/`, wired up by `vercel.json`. Import the repo on Vercel,
leave all settings alone and deploy. Responses are cached at the CDN, so many visitors share one upstream call.

## Files

- `main.js` the globe: cities, day/night, aurora, quakes, ISS, panel, sound
- `sky.js` stars, constellations, Sun, Moon, planets, pulsars (loaded separately so the globe works without it)
- `sats.js` satellites, `ship.js` the starfighter toy, `tonight.js` the "Tonight in..." sky card
- `city.js` the zoomed city view: map tiles, bikes, aircraft, radar
- `feeds.js` server-side fetching shared by `server.mjs` and `api/*`
- `bikes.js` the bike-share feed per city, `cities.js` the city list, `weather.js` weather and air quality, `sound.js` the heartbeat

## Data and credits

- Aircraft: [adsb.lol](https://adsb.lol), community ADS-B data
- Bike share: public GBFS feeds (Citi Bike, Divvy, Bike Share Toronto, Metro, Ecobici, Bicimad, Velib, nextbike, docomo and others) and Transport for London
- Weather and air quality: [Open-Meteo](https://open-meteo.com) (CC BY 4.0, non-commercial use)
- Earthquakes: USGS. Aurora: NOAA Space Weather Prediction Center. ISS position: wheretheiss.at
- Rain radar: [RainViewer](https://www.rainviewer.com). Map tiles: Esri. Land outlines and stars: Natural Earth and d3-celestial
- Satellite orbits: [CelesTrak](https://celestrak.org), propagated in the browser with [satellite.js](https://github.com/shashwatak/satellite-js). A snapshot lives in `data/` as a fallback
- Planet, Sun and Moon positions: [astronomy-engine](https://github.com/cosinekitty/astronomy)
- 3D: [three.js](https://threejs.org)

Pulsar positions and spin periods are well-known catalog values. Each is shown slowed down so nothing flashes fast.
