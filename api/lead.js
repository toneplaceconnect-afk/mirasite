export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Используйте POST.' }); }
  const origin = req.headers.origin;
  if (origin) { let host = ''; try { host = new URL(origin).host; } catch {} if (host !== req.headers.host) return res.status(403).json({ error: 'Запрещено.' }); }
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const optional = (key, max) => body && (body[key] === undefined || body[key] === '' || (typeof body[key] === 'string' && body[key].length <= max));
  if (!body || body.consent !== true || typeof body.summary !== 'string' || !body.summary.trim() || body.summary.length > 4000 || !optional('name', 100) || !optional('contact', 200)) return res.status(400).json({ error: 'Нет текста обращения или не подтверждена передача.' });
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return res.status(503).json({ error: 'Передача обращений пока не подключена. Обращение не отправлено.' });
  const details = [body.name && `Имя: ${body.name.trim()}`, body.contact && `Контакт: ${body.contact.trim()}`].filter(Boolean).join('\n');
  const text = `Обращение с сайта Mira\n\n${details ? details + '\n\n' : ''}${body.summary.trim()}\n\nПользователь подтвердил передачу обращения.`;
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: text.slice(0, 4096) }), signal: AbortSignal.timeout(15000) });
    const data = await response.json(); if (!response.ok || !data.ok) throw new Error('Telegram delivery failed');
    return res.status(200).json({ ok: true });
  } catch { return res.status(502).json({ error: 'Не удалось подтвердить доставку. Проверьте получение перед повторной отправкой.' }); }
}
