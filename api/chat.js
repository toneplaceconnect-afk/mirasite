// Чат Mira: обработчик запроса. Вся логика лежит в lib/mira.js.
import { loadKnowledge, providerOrder, modelsFor, limited, askProvider, sanitizeReply, leadAllowed, log, PRICE_FALLBACK } from '../lib/mira.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Проверка состояния без секретов: сколько модулей знаний загружено и сколько провайдеров настроено.
  if (req.method === 'GET') {
    try { const k = loadKnowledge(); return res.status(200).json({ ok: true, knowledgeModules: k.names, providers: providerOrder().length }); }
    catch { return res.status(500).json({ ok: false, error: 'Знания не загружены.' }); }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Используйте POST.' }); }
  const origin = req.headers.origin;
  if (origin) { let host = ''; try { host = new URL(origin).host; } catch {} if (host !== req.headers.host) return res.status(403).json({ error: 'Запрещено.' }); }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Слишком много сообщений. Попробуйте чуть позже.' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  const messages = body?.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 16 || messages.some((m) => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 8000) || messages.at(-1).role !== 'user' || messages.at(-1).content.length > 2000 || messages.reduce((n, m) => n + m.content.length, 0) > 12000) return res.status(400).json({ error: 'Некорректное сообщение.' });

  const order = providerOrder();
  if (!order.length) {
    // Ключей нет: честно показываем демонстрацию, а не притворяемся живым ИИ.
    log({ provider: 'demo' });
    return res.status(200).json({ reply: 'Я Mira, ИИ-помощник для сайта. Сейчас работает демонстрация, свободный диалог появится после подключения ИИ.', demo: true, leadReady: false, summary: '' });
  }

  let knowledge;
  try { knowledge = loadKnowledge(); } catch { log({ error: 'knowledge' }); return res.status(500).json({ error: 'Mira временно недоступна. Попробуйте позже.' }); }
  const chat = [{ role: 'system', content: knowledge.prompt }, ...messages.map((m) => ({ role: m.role, content: m.content }))];

  const deadline = Date.now() + 55000; // общий бюджет времени на все попытки
  for (const name of order) {
    for (const model of modelsFor(name)) {
      const left = deadline - Date.now();
      if (left < 3000) break;
      const started = Date.now();
      try {
        const out = await askProvider(name, chat, model, Math.min(25000, left));
        const reply = sanitizeReply(out.reply);
        const priceBlocked = reply === PRICE_FALLBACK && out.reply !== PRICE_FALLBACK;
        const wantsLead = out.leadReady === true && !priceBlocked;
        const summary = typeof out.summary === 'string' ? out.summary.trim().slice(0, 4000) : '';
        const leadReady = wantsLead && leadAllowed(summary, messages.filter((m) => m.role === 'user').map((m) => m.content));
        log({ provider: name, model, ms: Date.now() - started, leadReady, priceBlocked });
        return res.status(200).json({ reply, leadReady, summary: leadReady ? summary : '', demo: false });
      } catch (error) {
        log({ provider: name, model, ms: Date.now() - started, error: String(error.message || error).slice(0, 80) });
      }
    }
  }
  return res.status(502).json({ error: 'Не удалось получить ответ Mira. Попробуйте ещё раз.' });
}
