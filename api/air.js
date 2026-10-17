// Vercel function: GET /air.json?lat=&lon= (see vercel.json rewrite). CDN caches ok responses so visitors share one upstream call.
import { planes } from '../feeds.js';

export default async function handler(req, res) {
  const e = await planes(+req.query.lat, +req.query.lon).catch(() => ({ status: 502, data: [] }));
  if (e.status === 200) res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');
  res.status(e.status).json(e.data);
}
