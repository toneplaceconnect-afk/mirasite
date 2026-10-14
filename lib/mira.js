// Логика чата Mira (используется в api/chat.js и в тестах). Провайдеры ИИ идут по очереди: если один не ответил, берём следующий.
// Знания и контракт лежат в content/knowledge/*.md, их можно править без изменения кода.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const KNOWLEDGE_DIR = join(process.cwd(), 'content', 'knowledge');
// Порядок важен: сначала контракт, потом остальные модули.
const MODULE_ORDER = ['core', 'about', 'faq', 'limits', 'handoff'];

let knowledgeCache = null;
export function loadKnowledge() {
  if (knowledgeCache) return knowledgeCache;
  const files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md'));
  const names = [...MODULE_ORDER.filter((n) => files.includes(`${n}.md`)), ...files.map((f) => f.slice(0, -3)).filter((n) => !MODULE_ORDER.includes(n)).sort()];
  const parts = names.map((n) => readFileSync(join(KNOWLEDGE_DIR, `${n}.md`), 'utf8').trim());
  knowledgeCache = { names, prompt: parts.join('\n\n---\n\n') };
  return knowledgeCache;
}

// Провайдеры с OpenAI-совместимым API. Ключи только в переменных окружения Vercel.
const PROVIDERS = {
  groq: { key: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions', model: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', json: true },
  nvidia: { key: 'NVIDIA_API_KEY', url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: () => process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4.1-flash', json: false },
  dahl: { key: 'DAHL_API_KEY', url: 'https://inference.dahl.global/v1/chat/completions', model: () => process.env.DAHL_MODEL || 'MiniMaxAI/MiniMax-M2.7,deepseek-ai/DeepSeek-V4-Flash-0731,zai-org/GLM-5.3-Flash', json: false },
  openai: { key: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/chat/completions', model: () => process.env.OPENAI_MODEL || 'gpt-4o-mini', json: true },
  custom: { key: 'CUSTOM_API_KEY', url: () => `${(process.env.CUSTOM_BASE_URL || '').replace(/\/+$/, '')}/chat/completions`, model: () => process.env.CUSTOM_MODEL || '', json: false },
};

// В GROQ_MODEL, NVIDIA_MODEL, OPENAI_MODEL, CUSTOM_MODEL можно перечислить несколько моделей через запятую:
// если первая не ответила, чат пробует следующую, и только потом переходит к другому провайдеру.
export function modelsFor(name) {
  return String(PROVIDERS[name].model() || '').split(',').map((m) => m.trim()).filter(Boolean);
}

export function providerOrder() {
  const order = (process.env.AI_PROVIDER_ORDER || 'dahl,groq,nvidia,openai,custom').split(',').map((s) => s.trim()).filter((s) => PROVIDERS[s]);
  return order.filter((name) => process.env[PROVIDERS[name].key] && (name !== 'custom' || process.env.CUSTOM_BASE_URL));
}

// Достаёт JSON из ответа модели, даже если вокруг него есть лишний текст.
export function parseModelAnswer(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const tryParse = (s) => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : null; } catch { return null; } };
  let obj = tryParse(cleaned);
  if (!obj) { const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}'); if (a !== -1 && b > a) obj = tryParse(cleaned.slice(a, b + 1)); }
  if (!obj || typeof obj.reply !== 'string' || !obj.reply.trim()) return null;
  return obj;
}

// Контракт запрещает цены и цифры. Если модель всё же назвала сумму или процент, подменяем ответ.
const PRICE_RE = /(\d[\d\s.,]*\s*(?:₽|руб|р\.|тыс|млн|\$|€|usd|eur|долл|евро|%|процент))|((?:₽|\$|€)\s*\d)|((?<![а-яёa-z])от\s+\d[\d\s]*\s*(?:до|-|—)\s*\d)/i;
export const PRICE_FALLBACK = 'Суммы я не называю. Сейчас Mira бесплатна: акция действует до конца 2026 года. Условия после акции я не называю, но могу передать этот вопрос владельцу.';
export function sanitizeReply(reply) {
  let text = reply.replace(/\*\*|__|`{1,3}/g, '').replace(/^\s*[-*•]\s+/gm, '').replace(/^#+\s*/gm, '').trim();
  if (PRICE_RE.test(text)) return PRICE_FALLBACK;
  return text.slice(0, 2000);
}

// Контакт должен быть в обращении: формы на сайте нет. Ищем телефон, почту, @ник или ссылку.
const CONTACT_RE = /(\+?\d[\d\s().-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.-]+)|(@[\w]{3,})|(t\.me\/|vk\.(?:com|ru)\/|wa\.me\/)/i;
export function leadAllowed(summary, userMessages) {
  const s = typeof summary === 'string' ? summary.trim() : '';
  if (!s || s.length > 4000) return false;
  return CONTACT_RE.test(userMessages.join('\n'));
}

// Простой лимит запросов на IP. На serverless он работает в пределах одного инстанса, этого достаточно против случайного перегруза.
const hits = new Map();
export function limited(ip) {
  const now = Date.now(), windowMs = 10 * 60 * 1000, max = 40;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

export async function askProvider(name, messages, model, timeoutMs = 14000, signal) {
  const p = PROVIDERS[name];
  const url = typeof p.url === 'function' ? p.url() : p.url;
  const body = { model: model || modelsFor(name)[0], messages, temperature: 0.4, max_tokens: 1600 };
  if (p.json) body.response_format = { type: 'json_object' };
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env[p.key]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([AbortSignal.timeout(Math.max(1000, timeoutMs)), signal]) : AbortSignal.timeout(Math.max(1000, timeoutMs)) });
  if (!response.ok) {
    // Кусок ответа провайдера (без ключей) попадает в журнал: так видно, что именно не так, например неверное имя модели.
    let detail = ''; try { detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 110); } catch {}
    throw new Error(`HTTP ${response.status} ${detail}`.trim());
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = parseModelAnswer(content);
  if (parsed) return parsed;
  // Модель ответила обычным текстом без JSON: берём его как ответ, но передачу обращения не включаем.
  const plain = typeof content === 'string' ? content.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim() : '';
  if (plain && !/[{}]/.test(plain) && plain.length <= 2000) return { reply: plain, leadReady: false, summary: '' };
  throw new Error('bad answer');
}

export function log(event) { try { console.log(JSON.stringify({ ev: 'mira', ...event })); } catch {} }

// Пробует модели провайдера: следующая стартует, когда предыдущая упала или молчит дольше hedgeMs.
// Первый успешный ответ побеждает, остальные запросы отменяются. Так медленная или зависшая модель не съедает всё время.
export async function askModels(name, messages, models, { timeoutMs = 22000, hedgeMs = 7000, deadline = Infinity } = {}) {
  const stop = new AbortController();
  return new Promise((resolve, reject) => {
    let started = 0, failed = 0, done = false, timer;
    const next = () => {
      if (done || started >= models.length) return;
      const left = deadline - Date.now();
      if (left < 3000) { started = models.length; if (failed >= started) finish(new Error('no time')); return; }
      const model = models[started++], t0 = Date.now();
      clearTimeout(timer); if (started < models.length) timer = setTimeout(next, hedgeMs);
      askProvider(name, messages, model, Math.min(timeoutMs, left), stop.signal).then((out) => {
        if (done) return; done = true; clearTimeout(timer); stop.abort(); resolve({ out, model, ms: Date.now() - t0 });
      }, (error) => {
        if (done) return;
        log({ provider: name, model, ms: Date.now() - t0, error: String(error.message || error).slice(0, 160) });
        failed++; if (failed >= models.length || (started >= models.length && failed >= started)) finish(error); else next();
      });
    };
    const finish = (error) => { if (done) return; done = true; clearTimeout(timer); reject(error); };
    next();
  });
}
