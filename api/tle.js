// Vercel function: GET /tle?group= (see vercel.json rewrite). Orbit data changes slowly, so the CDN keeps it for 2 hours.
import { tle } from '../feeds.js';

export default async function handler(req, res) {
  try {
    const body = await tle(req.query.group);
    if (body == null) return res.status(404).json({});
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(body);
  } catch {
    res.status(502).json({});
  }
}
