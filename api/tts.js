// Голос Mira: пересылает короткий текст в голосовой сервис (Hugging Face Space с Piper) и возвращает MP3.
// Адрес сервиса лежит в переменных Vercel: TTS_URL (обязательно), TTS_TOKEN (необязательно).
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 60000, max = 40;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now); hits.set(ip, list);
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.some((t) => now - t < win)) hits.delete(k);
  return list.length > max;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Используйте POST.' }); }
  const origin = req.headers.origin;
  if (origin) { let host = ''; try { host = new URL(origin).host; } catch {} if (host !== req.headers.host) return res.status(403).json({ error: 'Запрещено.' }); }
  const base = (process.env.TTS_URL || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return res.status(503).json({ error: 'Голос не настроен.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Слишком много запросов.' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 420) return res.status(400).json({ error: 'Текст пустой или слишком длинный.' });
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.TTS_TOKEN) headers['x-tts-token'] = process.env.TTS_TOKEN;
    const r = await fetch(`${base}/tts`, { method: 'POST', headers, body: JSON.stringify({ text }), signal: AbortSignal.timeout(25000) });
    if (!r.ok) return res.status(502).json({ error: 'Голос временно недоступен.' });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).send(buf);
  } catch {
    return res.status(502).json({ error: 'Голос временно недоступен.' });
  }
}
