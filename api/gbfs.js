// Vercel function: GET /gbfs?city=&k= (see vercel.json rewrite).
import { bikeFeed } from '../feeds.js';

export default async function handler(req, res) {
  try {
    const body = await bikeFeed(req.query.city, +req.query.k);
    if (body == null) return res.status(404).json({});
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(body);
  } catch {
    res.status(502).json({});
  }
}
